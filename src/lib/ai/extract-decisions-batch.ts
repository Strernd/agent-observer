import { generateText, Output } from "ai";
import { db } from "@/db";
import { decisionRuns, decisions, events, sessions } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { insightBatchSchema, type InsightBatchExtraction, type Insight } from "./schemas";
import { isToolErrorEventType } from "@/lib/hooks/events";
import { getModelConfig } from "@/lib/observer-config";
const PROMPT_VERSION = "insight-extraction-v1";
const MAX_EVENT_LINE_CHARS = 2_500;
const MAX_EVENT_STREAM_CHARS = 400_000;

const SYSTEM_PROMPT = `You analyze a coding session's event stream and extract two types of insights about agent behavior. You are looking at the META layer — how the agent worked, not what it produced.

Output JSON: {"insights": [...]}

## Type 1: friction

A retry chain where a tool call failed and the agent had to find an alternative. Look for:
- Failed tool events followed by retries with the same or similar tool
- Wrong CLI flags or API parameters (agent guessed wrong, got an error, tried again)
- Platform incompatibilities (e.g. grep -P on macOS, tool not in subagent PATH)
- File-too-large errors (include the file path and token count from the error)
- The same mistake repeated later in the session (agent didn't learn from first failure)

For each friction item, include:
- Every failed attempt: event ID, tool, the command/input that was tried, the exact error message
- The resolution: what eventually worked (event ID + input), or null if never resolved
- Whether the exact same error pattern appeared again later in the session (repeated_later)
- If repeated, list the event IDs of the later occurrences in repeat_event_ids
- Any files involved (paths, token sizes where relevant)

Group related retry attempts into a single friction item. For example, if the agent tries 3 variations of the same CLI command before finding the right flags, that is one friction item with 3 attempts.

Do NOT report:
- Single failures that were immediately handled without retry or struggle
- Expected errors the agent handled gracefully as part of normal flow
- Team coordination issues (idle spin, subagent respawning — those are inherent to agent teams)
- Token expiry or authentication failures (operational, not agent behavior)

## Type 2: autonomous_decision

A choice the agent made ON ITS OWN — not directed by user input — that meaningfully altered what was delivered. Look for:
- Assumptions about targets, URLs, or scope that the user later had to correct
- Dropping or adding scope without being asked (e.g. removing a requested item from the deliverable)
- Novel inferences connecting data points the user didn't suggest
- Creative workarounds for blocked investigation paths

For each autonomous decision, note whether the user later corrected it (with the correction event ID and what they said).

Do NOT report:
- Things the user explicitly asked for ("create a team" when user invoked /field-report)
- Pivots directly caused by user feedback ("user said to change X, so agent changed X")
- Team coordination mechanics (spawning agents, task management, message routing)
- Findings about the system being analyzed (those belong in the report output, not in meta)
- Operational interruptions (token expiry, auth failures) unless the agent's response to them was autonomously notable

## Evidence rules
- Every insight must cite evidence_event_ids from the event stream.
- For friction: evidence_event_ids should cover the full retry chain (all failed attempts + resolution if any).
- For autonomous_decision: evidence_event_ids should include the events where the choice was made and, if corrected, the user correction event.
- Do not invent event IDs not present in the stream.
- Do not force a fixed count. Return as many as are genuinely notable. Zero is valid if the session has no friction or autonomous decisions.`;

type DecisionRunStatus = "running" | "succeeded" | "failed";

type SessionEventContext = {
  id: number;
  eventType: string;
  source: string | null;
  model: string | null;
  toolName: string | null;
  failureOperation: string | null;
  failureType: string | null;
  failureExitCode: number | null;
  failureErrorLine: string | null;
  prompt: string | null;
  response: string | null;
  toolInput: string | null;
  toolResponse: string | null;
  timestamp: Date;
};

type ValidatedInsight = {
  decision: string;
  whyPivotal: string;
  category: "friction" | "autonomous_decision";
  confidence: "high";
  evidenceEventIds: number[];
  whatFailed: Record<string, unknown> | null;
};

export async function findRunningDecisionRun(sessionId: string) {
  const [run] = await db
    .select()
    .from(decisionRuns)
    .where(and(eq(decisionRuns.sessionId, sessionId), eq(decisionRuns.status, "running")))
    .orderBy(desc(decisionRuns.startedAt), desc(decisionRuns.id))
    .limit(1);

  return run ?? null;
}

export async function getLatestDecisionRun(sessionId: string) {
  const [run] = await db
    .select()
    .from(decisionRuns)
    .where(eq(decisionRuns.sessionId, sessionId))
    .orderBy(desc(decisionRuns.startedAt), desc(decisionRuns.id))
    .limit(1);

  return run ?? null;
}

export async function getLatestSuccessfulDecisionRun(sessionId: string) {
  const [run] = await db
    .select()
    .from(decisionRuns)
    .where(and(eq(decisionRuns.sessionId, sessionId), eq(decisionRuns.status, "succeeded")))
    .orderBy(desc(decisionRuns.startedAt), desc(decisionRuns.id))
    .limit(1);

  return run ?? null;
}

export async function createDecisionRun(sessionId: string) {
  const now = new Date();
  const [run] = await db
    .insert(decisionRuns)
    .values({
      sessionId,
      status: "running",
      triggeredBy: "ui",
      startedAt: now,
      model: getModelConfig().extraction,
      promptVersion: PROMPT_VERSION,
    })
    .returning();

  if (!run) {
    throw new Error("failed_to_create_decision_run");
  }

  return run;
}

export async function runDecisionExtraction(runId: number, sessionId: string) {
  try {
    const context = await loadSessionContext(sessionId);
    const extraction = await extractInsights(context);
    const validated = validateInsights(extraction, context.eventsById);
    const now = new Date();
    const lastProcessedEventId =
      context.eventRows[context.eventRows.length - 1]?.id ?? null;

    await db.transaction(async (tx) => {
      tx.delete(decisions).where(eq(decisions.sessionId, sessionId)).run();

      if (validated.length > 0) {
        tx.insert(decisions)
          .values(
            validated.map((item, index) => ({
              sessionId,
              runId,
              ordinal: index + 1,
              decision: item.decision,
              whyPivotal: item.whyPivotal,
              category: item.category,
              confidence: item.confidence,
              evidenceEventIds: JSON.stringify(item.evidenceEventIds),
              whatFailed: item.whatFailed ? JSON.stringify(item.whatFailed) : null,
              createdAt: now,
            }))
          )
          .run();
      }

      tx.update(decisionRuns)
        .set({
          status: "succeeded",
          endedAt: now,
          errorMessage: null,
          decisionCount: validated.length,
          lastProcessedEventId,
        })
        .where(eq(decisionRuns.id, runId))
        .run();
    });
  } catch (error) {
    await failDecisionRun(runId, error, sessionId);
  }
}

async function failDecisionRun(runId: number, error: unknown, sessionId: string) {
  const [eventState] = await db
    .select({
      latestEventId: events.id,
    })
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .orderBy(desc(events.id))
    .limit(1);

  await db
    .update(decisionRuns)
    .set({
      status: "failed",
      endedAt: new Date(),
      errorMessage: toErrorMessage(error),
      decisionCount: null,
      lastProcessedEventId: eventState?.latestEventId ?? null,
    })
    .where(eq(decisionRuns.id, runId));
}

async function loadSessionContext(sessionId: string) {
  const [session] = await db
    .select({
      id: sessions.id,
      cwd: sessions.cwd,
      source: sessions.source,
      model: sessions.model,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      eventCount: sessions.eventCount,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error(`session_not_found:${sessionId}`);
  }

  const rows = await db
    .select({
      id: events.id,
      eventType: events.eventType,
      source: events.source,
      model: events.model,
      toolName: events.toolName,
      failureOperation: events.failureOperation,
      failureType: events.failureType,
      failureExitCode: events.failureExitCode,
      failureErrorLine: events.failureErrorLine,
      prompt: events.prompt,
      response: events.response,
      toolInput: events.toolInput,
      toolResponse: events.toolResponse,
      timestamp: events.timestamp,
    })
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .orderBy(asc(events.id));

  const eventsById = new Map<number, SessionEventContext>();
  for (const row of rows) {
    eventsById.set(row.id, row);
  }

  return {
    session,
    eventRows: rows,
    eventsById,
    timelineSummary: buildTimelineSummary(rows),
    eventStream: buildEventStream(rows),
  };
}

async function extractInsights(context: {
  session: {
    id: string;
    cwd: string | null;
    source: string | null;
    model: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    eventCount: number;
  };
  eventRows: SessionEventContext[];
  timelineSummary: string;
  eventStream: string;
}): Promise<InsightBatchExtraction> {
  const prompt = [
    `Session: ${context.session.id}`,
    `cwd: ${context.session.cwd ?? "unknown"}`,
    `source: ${context.session.source ?? "unknown"}`,
    `model: ${context.session.model ?? "unknown"}`,
    `started_at: ${context.session.startedAt?.toISOString() ?? "unknown"}`,
    `ended_at: ${context.session.endedAt?.toISOString() ?? "active"}`,
    `event_count: ${context.eventRows.length}`,
    "",
    "Timeline summary:",
    context.timelineSummary,
    "",
    "Ordered event stream:",
    context.eventStream,
  ].join("\n");

  const { output } = await generateText({
    model: getModelConfig().extraction,
    output: Output.object({ schema: insightBatchSchema }),
    system: SYSTEM_PROMPT,
    prompt,
  });

  if (!output) {
    throw new Error("insight_extraction_empty_output");
  }

  return output;
}

function buildTimelineSummary(rows: SessionEventContext[]): string {
  const total = rows.length;
  const failures = rows.filter(
    (row) => isToolErrorEventType(row.eventType) || !!row.failureType
  );

  const toolCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.toolName) continue;
    toolCounts.set(row.toolName, (toolCounts.get(row.toolName) ?? 0) + 1);
  }

  const topTools = Array.from(toolCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => `${name}:${count}`)
    .join(", ");

  const failureLines = failures
    .slice(-20)
    .map((row) => {
      const parts = [
        `#${row.id}`,
        row.toolName ? `tool=${row.toolName}` : null,
        row.failureType ? `type=${row.failureType}` : null,
        row.failureOperation ? `op=${cleanInline(row.failureOperation, 200)}` : null,
        row.failureErrorLine ? `error=${cleanInline(row.failureErrorLine, 800)}` : null,
      ].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    });

  return [
    `total_events: ${total}`,
    `failure_events: ${failures.length}`,
    `top_tools: ${topTools || "none"}`,
    "recent_failures:",
    failureLines.length > 0 ? failureLines.join("\n") : "- none",
  ].join("\n");
}

function buildEventStream(rows: SessionEventContext[]): string {
  const lines = rows.map((row) => {
    const isFailure = isToolErrorEventType(row.eventType) || !!row.failureType;

    const parts = [
      `#${row.id}`,
      row.timestamp.toISOString(),
      row.eventType,
      row.source ? `source=${cleanInline(row.source, 120)}` : null,
      row.model ? `model=${cleanInline(row.model, 160)}` : null,
      row.toolName ? `tool=${row.toolName}` : null,
      row.failureType ? `failure_type=${row.failureType}` : null,
      row.failureExitCode !== null ? `exit_code=${row.failureExitCode}` : null,
      row.failureOperation ? `operation=${cleanInline(row.failureOperation, 300)}` : null,
      row.failureErrorLine ? `failure_line=${cleanInline(row.failureErrorLine, 1_000)}` : null,
      row.prompt ? `prompt=${cleanInline(row.prompt, 200)}` : null,
      row.response ? `response=${cleanInline(row.response, 200)}` : null,
      row.toolInput ? `tool_input=${cleanInline(row.toolInput, isFailure ? 500 : 400)}` : null,
      row.toolResponse ? `tool_response=${cleanInline(row.toolResponse, isFailure ? 600 : 500)}` : null,
    ].filter(Boolean);

    return cleanInline(parts.join(" | "), MAX_EVENT_LINE_CHARS);
  });

  const full = lines.join("\n");
  if (full.length <= MAX_EVENT_STREAM_CHARS) return full;

  return [
    "[event stream truncated to fit model context; oldest lines omitted]",
    full.slice(full.length - MAX_EVENT_STREAM_CHARS),
  ].join("\n");
}

function validateInsights(
  extraction: InsightBatchExtraction,
  eventsById: Map<number, SessionEventContext>
): ValidatedInsight[] {
  return extraction.insights.map((item, index) => {
    const evidenceEventIds = uniqueSorted(item.evidence_event_ids);

    if (evidenceEventIds.length === 0) {
      throw new Error(`insight_${index}_missing_evidence_event_ids`);
    }

    for (const eventId of evidenceEventIds) {
      if (!eventsById.has(eventId)) {
        throw new Error(`insight_${index}_invalid_evidence_event_id:${eventId}`);
      }
    }

    if (item.type === "friction") {
      for (const attempt of item.attempts) {
        if (!eventsById.has(attempt.event_id)) {
          throw new Error(`insight_${index}_invalid_attempt_event_id:${attempt.event_id}`);
        }
      }
      if (item.resolution && !eventsById.has(item.resolution.event_id)) {
        throw new Error(`insight_${index}_invalid_resolution_event_id:${item.resolution.event_id}`);
      }
      for (const repeatId of item.repeat_event_ids) {
        if (!eventsById.has(repeatId)) {
          throw new Error(`insight_${index}_invalid_repeat_event_id:${repeatId}`);
        }
      }
    }

    if (item.type === "autonomous_decision") {
      if (item.correction_event_id !== null && !eventsById.has(item.correction_event_id)) {
        throw new Error(`insight_${index}_invalid_correction_event_id:${item.correction_event_id}`);
      }
    }

    return mapInsightToRow(item);
  });
}

function mapInsightToRow(item: Insight): ValidatedInsight {
  if (item.type === "friction") {
    return {
      decision: cleanInline(item.summary, 500),
      whyPivotal: cleanInline(item.why_notable, 600),
      category: "friction",
      confidence: "high",
      evidenceEventIds: uniqueSorted(item.evidence_event_ids),
      whatFailed: {
        type: "friction",
        attempts: item.attempts,
        resolution: item.resolution,
        repeated_later: item.repeated_later,
        repeat_event_ids: item.repeat_event_ids,
        files_involved: item.files_involved,
      },
    };
  }

  return {
    decision: cleanInline(item.summary, 500),
    whyPivotal: cleanInline(item.why_notable, 600),
    category: "autonomous_decision",
    confidence: "high",
    evidenceEventIds: uniqueSorted(item.evidence_event_ids),
    whatFailed: item.was_corrected_by_user
      ? {
          type: "autonomous_decision",
          was_corrected_by_user: true,
          correction_event_id: item.correction_event_id,
          user_correction_text: item.user_correction_text,
        }
      : null,
  };
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values.map((value) => Math.floor(value)))).sort(
    (a, b) => a - b
  );
}

function cleanInline(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}...`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return cleanInline(error.message, 800);
  }

  if (typeof error === "string") {
    return cleanInline(error, 800);
  }

  return "Insight extraction failed";
}

export type { DecisionRunStatus };
