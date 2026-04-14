import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { decisions, decisionRuns, events, sessions, tickets } from "@/db/schema";
import { visibleSessionsCondition } from "@/lib/session-visibility";

export type DecisionRunState = "running" | "succeeded" | "failed";

export type SessionDecisionState = {
  hasSuccessfulRun: boolean;
  latestStatus: DecisionRunState | null;
  latestSuccessfulProcessedEventId: number | null;
};

export async function getSessionsWithSuccessfulDecisionRuns(
  sessionIds: string[]
) {
  if (sessionIds.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .select({
      sessionId: decisionRuns.sessionId,
    })
    .from(decisionRuns)
    .where(
      and(
        inArray(decisionRuns.sessionId, sessionIds),
        eq(decisionRuns.status, "succeeded")
      )
    )
    .groupBy(decisionRuns.sessionId);

  return new Set(rows.map((row) => row.sessionId));
}

export async function getLatestSessionDecisionStates(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return new Map<string, SessionDecisionState>();
  }

  const rows = await db
    .select({
      sessionId: decisionRuns.sessionId,
      status: decisionRuns.status,
      startedAt: decisionRuns.startedAt,
      id: decisionRuns.id,
      lastProcessedEventId: decisionRuns.lastProcessedEventId,
    })
    .from(decisionRuns)
    .where(inArray(decisionRuns.sessionId, sessionIds))
    .orderBy(desc(decisionRuns.startedAt), desc(decisionRuns.id));

  const states = new Map<string, SessionDecisionState>();
  for (const sessionId of sessionIds) {
    states.set(sessionId, {
      hasSuccessfulRun: false,
      latestStatus: null,
      latestSuccessfulProcessedEventId: null,
    });
  }

  for (const row of rows) {
    const current = states.get(row.sessionId);
    if (!current) continue;

    const normalizedStatus =
      row.status === "running" || row.status === "succeeded" || row.status === "failed"
        ? row.status
        : null;

    if (current.latestStatus === null) {
      current.latestStatus = normalizedStatus;
    }

    if (!current.hasSuccessfulRun && row.status === "succeeded") {
      current.hasSuccessfulRun = true;
      current.latestSuccessfulProcessedEventId = row.lastProcessedEventId ?? null;
    }
  }

  return states;
}

export async function getLatestSessionEventIds(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await db
    .select({
      sessionId: events.sessionId,
      latestEventId: sql<number>`max(${events.id})`,
    })
    .from(events)
    .where(inArray(events.sessionId, sessionIds))
    .groupBy(events.sessionId);

  return new Map(rows.map((row) => [row.sessionId, row.latestEventId]));
}

export async function getSessionInsightCounts(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return new Map<
      string,
      { decisionCount: number; frictionCount: number }
    >();
  }

  const rows = await db
    .select({
      sessionId: decisions.sessionId,
      decisionCount:
        sql<number>`sum(case when ${decisions.category} = 'autonomous_decision' then 1 else 0 end)`,
      frictionCount:
        sql<number>`sum(case when ${decisions.category} = 'friction' then 1 else 0 end)`,
    })
    .from(decisions)
    .where(inArray(decisions.sessionId, sessionIds))
    .groupBy(decisions.sessionId);

  return new Map(
    rows.map((row) => [
      row.sessionId,
      {
        decisionCount: row.decisionCount ?? 0,
        frictionCount: row.frictionCount ?? 0,
      },
    ])
  );
}

export async function getLatestTicketEventIds(ticketIds: string[]) {
  if (ticketIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await db
    .select({
      ticketId: tickets.id,
      latestEventId: sql<number>`max(${events.id})`,
    })
    .from(tickets)
    .innerJoin(sessions, eq(sessions.ticketId, tickets.id))
    .innerJoin(events, eq(events.sessionId, sessions.id))
    .where(and(inArray(tickets.id, ticketIds), visibleSessionsCondition()))
    .groupBy(tickets.id);

  return new Map(rows.map((row) => [row.ticketId, row.latestEventId]));
}

export async function getLatestSessionGroupEventIds(sessionGroups: string[]) {
  if (sessionGroups.length === 0) {
    return new Map<string, number>();
  }

  const rows = await db
    .select({
      sessionGroup: sessions.sessionGroup,
      latestEventId: sql<number>`max(${events.id})`,
    })
    .from(sessions)
    .innerJoin(events, eq(events.sessionId, sessions.id))
    .where(
      and(
        inArray(sessions.sessionGroup, sessionGroups),
        isNull(sessions.ticketId),
        visibleSessionsCondition()
      )
    )
    .groupBy(sessions.sessionGroup);

  return new Map(
    rows
      .filter(
        (row): row is { sessionGroup: string; latestEventId: number } =>
          typeof row.sessionGroup === "string"
      )
      .map((row) => [row.sessionGroup, row.latestEventId])
  );
}
