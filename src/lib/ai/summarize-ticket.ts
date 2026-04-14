import { generateText, Output } from "ai";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, sessions, tickets } from "@/db/schema";
import {
  ticketSummarySchema,
  type TicketSummary,
  type ToolStat,
} from "./schemas";
import { visibleSessionsCondition } from "@/lib/session-visibility";
import { getModelConfig } from "@/lib/observer-config";
import { summarizeSession } from "./summarize-session";

const TICKET_SYSTEM_PROMPT = `You summarize tickets that group multiple coding-agent sessions.

Focus on the ticket's current state, not a play-by-play chronology.

Return:
1. currentState: one sentence describing where the ticket stands now
2. progressSoFar: concise bullets of confirmed progress across sessions
3. openQuestions: unresolved questions, missing evidence, or risks
4. blockersOrFriction: repeated failures, churn, contradictions, or user corrections that matter at ticket level
5. nextBestAction: the single most useful next action
6. confidence: high, medium, or low based on how well the latest sessions support the current state

Rules:
- Prefer durable conclusions over repeating each session summary.
- Call out when later sessions supersede earlier assumptions.
- Distinguish confirmed work from hypotheses.
- Treat each visible session as evidence. Do not overweight a session because it has more events or a more detailed summary.
- If the work expanded from an initial issue into broader evaluation, fact-checking, or decision support, reflect that broader scope in currentState.
- Represent the major workstreams across the sessions instead of collapsing everything into the first or loudest technical keyword.
- Keep every field concise.
- Use empty arrays only when there is truly nothing notable.`;

interface SessionRow {
  id: string;
  sessionName: string | null;
  source: string | null;
  model: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  summary: string | null;
  frictionPoints: string | null;
  sessionType: string | null;
}

interface FrictionPoint {
  description: string;
  severity: string;
}

export async function summarizeTicketWithPendingSessions(ticketId: string) {
  const sessionStateRows = await db
    .select({
      id: sessions.id,
      summaryLastProcessedEventId: sessions.summaryLastProcessedEventId,
      latestEventId: sql<number | null>`max(${events.id})`,
    })
    .from(sessions)
    .leftJoin(events, eq(events.sessionId, sessions.id))
    .where(
      and(eq(sessions.ticketId, ticketId), visibleSessionsCondition())
    )
    .groupBy(sessions.id)
    .orderBy(asc(sessions.startedAt));

  const pendingSessionRows = sessionStateRows.filter((session) => {
    if (session.latestEventId === null) {
      return false;
    }

    if (session.summaryLastProcessedEventId === null) {
      return true;
    }

    return session.latestEventId > session.summaryLastProcessedEventId;
  });

  await Promise.all(
    pendingSessionRows.map((session) => summarizeSession(session.id))
  );

  await summarizeTicket(ticketId);
}

export async function summarizeTicket(ticketId: string) {
  try {
    const [ticket] = await db
      .select({
        id: tickets.id,
        customer: tickets.customer,
        title: tickets.title,
      })
      .from(tickets)
      .where(eq(tickets.id, ticketId));

    if (!ticket) return;

    const sessionRows = await db
      .select({
        id: sessions.id,
        sessionName: sessions.sessionName,
        source: sessions.source,
        model: sessions.model,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        summary: sessions.summary,
        frictionPoints: sessions.frictionPoints,
        sessionType: sessions.sessionType,
      })
      .from(sessions)
      .where(and(eq(sessions.ticketId, ticketId), visibleSessionsCondition()))
      .orderBy(asc(sessions.startedAt));

    const [eventState] = await db
      .select({
        latestEventId: sql<number | null>`max(${events.id})`,
      })
      .from(events)
      .innerJoin(sessions, eq(sessions.id, events.sessionId))
      .where(and(eq(sessions.ticketId, ticketId), visibleSessionsCondition()));
    const latestEventId = eventState?.latestEventId ?? null;

    const { toolStats, skillStats } = await getTicketToolStats(ticketId);

    if (sessionRows.length === 0) {
      await db
        .update(tickets)
        .set({
          summaryCurrentState: null,
          summaryProgress: JSON.stringify([]),
          summaryOpenQuestions: JSON.stringify([]),
          summaryBlockers: JSON.stringify([]),
          summaryNextAction: null,
          summaryConfidence: null,
          toolStats: JSON.stringify(toolStats),
          skillStats: JSON.stringify(skillStats),
          summaryUpdatedAt: null,
          summaryLastProcessedEventId: latestEventId,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, ticketId));

      return;
    }

    const formattedSessions = formatSessions(sessionRows);
    const formattedTools = formatStats(toolStats);
    const formattedSkills = formatStats(skillStats);

    const { output } = await generateText({
      model: getModelConfig().summary,
      output: Output.object({ schema: ticketSummarySchema }),
      system: TICKET_SYSTEM_PROMPT,
      prompt: [
        `Ticket ${ticket.id}`,
        `Customer: ${ticket.customer}`,
        ticket.title ? `Title: ${ticket.title}` : null,
        `Session count: ${sessionRows.length}`,
        formattedTools ? `Top tools:\n${formattedTools}` : "Top tools: none",
        formattedSkills
          ? `Skills used:\n${formattedSkills}`
          : "Skills used: none",
        `Sessions:\n${truncate(formattedSessions, 12000)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    if (!output) return;

    await persistTicketSummary(
      ticketId,
      output,
      toolStats,
      skillStats,
      latestEventId
    );
  } catch (err) {
    console.error("[agent-observer] Ticket summary error:", err);
  }
}

async function persistTicketSummary(
  ticketId: string,
  summary: TicketSummary,
  toolStats: ToolStat[],
  skillStats: ToolStat[],
  latestEventId: number | null
) {
  await db
    .update(tickets)
    .set({
      summaryCurrentState: summary.currentState,
      summaryProgress: JSON.stringify(summary.progressSoFar),
      summaryOpenQuestions: JSON.stringify(summary.openQuestions),
      summaryBlockers: JSON.stringify(summary.blockersOrFriction),
      summaryNextAction: summary.nextBestAction,
      summaryConfidence: summary.confidence,
      toolStats: JSON.stringify(toolStats),
      skillStats: JSON.stringify(skillStats),
      summaryUpdatedAt: new Date(),
      summaryLastProcessedEventId: latestEventId,
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, ticketId));
}

async function getTicketToolStats(ticketId: string): Promise<{
  toolStats: ToolStat[];
  skillStats: ToolStat[];
}> {
  const rows = await db
    .select({
      toolName: events.toolName,
      toolInput: events.toolInput,
    })
    .from(events)
    .innerJoin(sessions, eq(sessions.id, events.sessionId))
    .where(
      and(
        eq(sessions.ticketId, ticketId),
        eq(events.eventType, "tool_pre"),
        visibleSessionsCondition()
      )
    )
    .orderBy(asc(events.id));

  const toolCounts = new Map<string, number>();
  const skillCounts = new Map<string, number>();

  for (const row of rows) {
    if (!row.toolName) continue;

    const toolName = row.toolName.trim();
    if (!toolName) continue;

    if (toolName === "Skill") {
      const skillName = parseSkillName(row.toolInput);
      if (skillName) {
        skillCounts.set(skillName, (skillCounts.get(skillName) ?? 0) + 1);
        continue;
      }
    }

    toolCounts.set(toolName, (toolCounts.get(toolName) ?? 0) + 1);
  }

  return {
    toolStats: sortStats(toolCounts),
    skillStats: sortStats(skillCounts),
  };
}

function formatSessions(sessionRows: SessionRow[]) {
  return sessionRows
    .map((session, index) => {
      const friction = parseJsonArray<FrictionPoint>(session.frictionPoints)
        .map((item) => `${item.severity}: ${item.description}`)
        .join("; ");

      return [
        `Session ${index + 1}`,
        `id=${session.id}`,
        session.startedAt ? `started=${session.startedAt.toISOString()}` : null,
        session.endedAt ? `ended=${session.endedAt.toISOString()}` : null,
        session.sessionName ? `name=${session.sessionName}` : null,
        session.source ? `source=${session.source}` : null,
        session.model ? `model=${session.model}` : null,
        session.sessionType ? `type=${session.sessionType}` : null,
        session.summary ? `summary=${session.summary}` : "summary=unavailable",
        friction ? `friction=${friction}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

function parseSkillName(raw: string | null): string | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed === "string") {
      const skill = parsed.trim();
      return skill || null;
    }

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const object = parsed as Record<string, unknown>;
    const candidates = [object.skill, object.skillName, object.name];

    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const skill = candidate.trim();
      if (skill) return skill;
    }

    if (object.skill && typeof object.skill === "object") {
      const nestedSkill = object.skill as Record<string, unknown>;
      const nestedCandidates = [nestedSkill.name, nestedSkill.path];

      for (const candidate of nestedCandidates) {
        if (typeof candidate !== "string") continue;
        const skill = candidate.trim();
        if (skill) return skill;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function sortStats(counts: Map<string, number>): ToolStat[] {
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.name.localeCompare(right.name);
    });
}

function formatStats(stats: ToolStat[]) {
  return stats
    .slice(0, 12)
    .map((item) => `- ${item.name}: ${item.count}`)
    .join("\n");
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
