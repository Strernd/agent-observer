import { generateText, Output } from "ai";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dailyReports,
  decisions,
  decisionRuns,
  events,
  sessions,
} from "@/db/schema";
import { dailyReportSchema, type DailyReport } from "@/lib/ai/schemas";
import {
  createDecisionRun,
  findRunningDecisionRun,
  runDecisionExtraction,
} from "@/lib/ai/extract-decisions-batch";
import { summarizeSession } from "@/lib/ai/summarize-session";
import { getModelConfig, loadObserverConfig } from "@/lib/observer-config";
import { visibleSessionsCondition } from "@/lib/session-visibility";

type ReportStatus = "idle" | "running" | "succeeded" | "failed";

type ParsedDailyReport = {
  reportDate: string;
  status: ReportStatus;
  summary: string | null;
  highLevelDone: string[];
  frictionHighlights: DailyReport["frictionHighlights"];
  topSuggestions: DailyReport["topSuggestions"];
  sessionCount: number;
  eventCount: number;
  processedSessionIds: string[];
  lastProcessedEventId: number | null;
  errorMessage: string | null;
  autoTriggeredAt: Date | null;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DailyReportState = {
  reportDate: string;
  report: ParsedDailyReport | null;
  sessionCount: number;
  eventCount: number;
  latestDayEventId: number | null;
  summaryTargetCount: number;
  decisionTargetCount: number;
  runningDecisionCount: number;
  needsProcessing: boolean;
};

type DaySessionActivity = {
  sessionId: string;
  latestDayEventId: number;
  dayEventCount: number;
  firstEventAt: Date;
  lastEventAt: Date;
  sessionName: string | null;
  sessionGroup: string | null;
  source: string | null;
  model: string | null;
  summary: string | null;
  summaryLastProcessedEventId: number | null;
};

type DayEventRow = {
  id: number;
  sessionId: string;
  eventType: string;
  toolName: string | null;
  toolInput: string | null;
  failureOperation: string | null;
  failureType: string | null;
  timestamp: Date;
};

type RawDayDecisionRow = {
  sessionId: string;
  category: string;
  decision: string;
  whyPivotal: string;
  evidenceEventIds: string | null;
  whatFailed: string | null;
};

type ActivityDayRow = {
  day: string;
  eventCount: number;
  latestEventId: number;
};

const STALE_RUN_MS = 2 * 60 * 1000;

export async function getDailyReportState(
  reportDate: string
): Promise<DailyReportState> {
  const [reportRow, activity, latestDecisionStates] = await Promise.all([
    getDailyReport(reportDate),
    getDaySessionActivity(reportDate),
    getLatestDecisionStatesForDay(reportDate),
  ]);

  const summaryTargetIds = activity
    .filter(
      (session) =>
        !session.summary ||
        (session.summaryLastProcessedEventId ?? 0) < session.latestDayEventId
    )
    .map((session) => session.sessionId);

  const decisionTargetIds = activity
    .filter((session) => {
      const state = latestDecisionStates.get(session.sessionId);

      if (state?.latestStatus === "running") {
        return false;
      }

      return (
        !state?.hasSuccessfulRun ||
        (state.latestSuccessfulProcessedEventId ?? 0) < session.latestDayEventId
      );
    })
    .map((session) => session.sessionId);

  const runningDecisionCount = activity.filter(
    (session) => latestDecisionStates.get(session.sessionId)?.latestStatus === "running"
  ).length;
  const latestDayEventId = activity.reduce<number | null>((current, session) => {
    if (current === null) return session.latestDayEventId;
    return Math.max(current, session.latestDayEventId);
  }, null);

  const needsProcessing =
    reportRow === null ||
    reportRow.status === "failed" ||
    summaryTargetIds.length > 0 ||
    decisionTargetIds.length > 0 ||
    runningDecisionCount > 0 ||
    ((reportRow.lastProcessedEventId ?? 0) < (latestDayEventId ?? 0) &&
      latestDayEventId !== null);

  return {
    reportDate,
    report: reportRow,
    sessionCount: activity.length,
    eventCount: activity.reduce((total, session) => total + session.dayEventCount, 0),
    latestDayEventId,
    summaryTargetCount: summaryTargetIds.length,
    decisionTargetCount: decisionTargetIds.length,
    runningDecisionCount,
    needsProcessing,
  };
}

export async function maybeAutoProcessPreviousDayReportOnFirstEvent(
  now: Date,
  currentEventId: number
) {
  if (!loadObserverConfig().reports?.autoProcessPreviousDayOnFirstEvent) {
    return false;
  }

  const { start, end } = getLocalDayBounds(formatLocalDay(now));
  const [today] = await db
    .select({
      firstEventId: sql<number>`min(${events.id})`,
    })
    .from(events)
    .innerJoin(sessions, eq(sessions.id, events.sessionId))
    .where(
      and(
        visibleSessionsCondition(),
        gte(events.timestamp, start),
        lt(events.timestamp, end)
      )
    );

  if ((today?.firstEventId ?? null) !== currentEventId) {
    return false;
  }

  const previousDay = getPreviousLocalDay(now);
  const state = await getDailyReportState(previousDay);

  if (state.eventCount === 0) {
    return false;
  }

  const claimed = await claimAutoTrigger(previousDay, now);
  if (!claimed) {
    return false;
  }

  if (state.report?.status === "running" || !state.needsProcessing) {
    return true;
  }

  const { alreadyRunning } = await startDailyReportRun(previousDay);
  if (!alreadyRunning) {
    await processDailyReport(previousDay);
  }

  return true;
}

export async function reconcileDailyReportState(reportDate: string) {
  validateReportDate(reportDate);
  await failStaleRunningDecisionRunsForDay(reportDate);
  const report = await getDailyReport(reportDate);

  if (!report || report.status !== "running") {
    return getDailyReportState(reportDate);
  }

  const isFresh =
    Date.now() - report.updatedAt.getTime() < STALE_RUN_MS;

  if (isFresh) {
    return getDailyReportState(reportDate);
  }

  const latestDecisionStates = await getLatestDecisionStatesForDay(reportDate);
  const hasRunningDecision = Array.from(latestDecisionStates.values()).some(
    (state) => state.latestStatus === "running"
  );

  if (hasRunningDecision) {
    return getDailyReportState(reportDate);
  }

  await db
    .update(dailyReports)
    .set({
      status: "failed",
      errorMessage:
        "Daily report processing stopped making progress. Retry to process this day again.",
      updatedAt: new Date(),
    })
    .where(eq(dailyReports.reportDate, reportDate))
    .run();

  return getDailyReportState(reportDate);
}

export async function listDailyReports(limit = 30) {
  const [reportRows, activityRows] = await Promise.all([
    db
      .select()
      .from(dailyReports)
      .orderBy(desc(dailyReports.reportDate))
      .limit(limit * 2),
    getRecentActivityDays(limit * 2),
  ]);

  const byDay = new Map<
    string,
    {
      report: ParsedDailyReport | null;
      activity: ActivityDayRow | null;
    }
  >();

  for (const row of reportRows) {
    byDay.set(row.reportDate, {
      report: parseDailyReportRow(row),
      activity: null,
    });
  }

  for (const row of activityRows) {
    const existing = byDay.get(row.day);
    byDay.set(row.day, {
      report: existing?.report ?? null,
      activity: row,
    });
  }

  return Array.from(byDay.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, limit)
    .map(([reportDate, entry]) => {
      const latestEventId = entry.activity?.latestEventId ?? null;

      return {
        reportDate,
        status: entry.report?.status ?? "idle",
        summary: entry.report?.summary ?? null,
        sessionCount: entry.report?.sessionCount ?? null,
        storedEventCount: entry.report?.eventCount ?? null,
        activityEventCount: entry.activity?.eventCount ?? null,
        latestEventId,
        generatedAt: entry.report?.generatedAt ?? null,
        hasStoredReport: entry.report !== null,
        needsRefresh:
          latestEventId !== null &&
          (entry.report?.lastProcessedEventId ?? 0) < latestEventId,
      };
    });
}

export async function startDailyReportRun(reportDate: string) {
  validateReportDate(reportDate);
  await failStaleRunningDecisionRunsForDay(reportDate);
  const now = new Date();
  const [existing] = await db
    .select()
    .from(dailyReports)
    .where(eq(dailyReports.reportDate, reportDate))
    .limit(1);

  if (existing?.status === "running") {
    const lastUpdatedAt = existing.updatedAt?.getTime?.() ?? 0;
    const isFresh = Date.now() - lastUpdatedAt < STALE_RUN_MS;

    if (isFresh) {
      return {
        alreadyRunning: true,
        report: parseDailyReportRow(existing),
      };
    }

    const latestDecisionStates = await getLatestDecisionStatesForDay(reportDate);
    const hasRunningDecision = Array.from(latestDecisionStates.values()).some(
      (state) => state.latestStatus === "running"
    );

    if (hasRunningDecision) {
      return {
        alreadyRunning: true,
        report: parseDailyReportRow(existing),
      };
    }

    await db
      .update(dailyReports)
      .set({
        status: "failed",
        errorMessage:
          "Replaced a stale daily report run before starting a new one.",
        updatedAt: now,
      })
      .where(eq(dailyReports.reportDate, reportDate))
      .run();
  }

  await db
    .insert(dailyReports)
    .values({
      reportDate,
      status: "running",
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: dailyReports.reportDate,
      set: {
        status: "running",
        errorMessage: null,
        updatedAt: now,
      },
    })
    .run();

  const [row] = await db
    .select()
    .from(dailyReports)
    .where(eq(dailyReports.reportDate, reportDate))
    .limit(1);

  return {
    alreadyRunning: false,
    report: row ? parseDailyReportRow(row) : null,
  };
}

async function touchDailyReport(
  reportDate: string,
  patch: Partial<typeof dailyReports.$inferInsert> = {}
) {
  await db
    .update(dailyReports)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(dailyReports.reportDate, reportDate))
    .run();
}

export async function processDailyReport(reportDate: string) {
  validateReportDate(reportDate);
  await failStaleRunningDecisionRunsForDay(reportDate);
  const now = new Date();

  try {
    const initialState = await getDailyProcessingContext(reportDate);

    await db
      .insert(dailyReports)
      .values({
        reportDate,
        status: "running",
        sessionCount: initialState.sessions.length,
        eventCount: initialState.totalEventCount,
        lastProcessedEventId: initialState.latestDayEventId,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dailyReports.reportDate,
        set: {
          status: "running",
          sessionCount: initialState.sessions.length,
          eventCount: initialState.totalEventCount,
          lastProcessedEventId: initialState.latestDayEventId,
          errorMessage: null,
          updatedAt: now,
        },
      })
      .run();

    for (const session of initialState.sessions) {
      if (
        !session.summary ||
        (session.summaryLastProcessedEventId ?? 0) < session.latestDayEventId
      ) {
        await touchDailyReport(reportDate, {
          sessionCount: initialState.sessions.length,
          eventCount: initialState.totalEventCount,
        });
        await summarizeSession(session.sessionId);
      }
    }

    for (const session of initialState.sessions) {
      const state = initialState.latestDecisionStates.get(session.sessionId);

      if (state?.latestStatus === "running") {
        await touchDailyReport(reportDate, {
          errorMessage:
            "Waiting for an in-flight session decision extraction to finish.",
        });
        continue;
      }

      const needsDecisionRefresh =
        !state?.hasSuccessfulRun ||
        (state.latestSuccessfulProcessedEventId ?? 0) < session.latestDayEventId;

      if (!needsDecisionRefresh) {
        continue;
      }

      const running = await findRunningDecisionRun(session.sessionId);
      if (running) {
        await touchDailyReport(reportDate, {
          errorMessage:
            "Waiting for an in-flight session decision extraction to finish.",
        });
        continue;
      }

      await touchDailyReport(reportDate, {
        sessionCount: initialState.sessions.length,
        eventCount: initialState.totalEventCount,
      });
      const run = await createDecisionRun(session.sessionId);
      await runDecisionExtraction(run.id, session.sessionId);
    }

    await touchDailyReport(reportDate, {
      errorMessage: null,
    });
    const refreshed = await getDailyProcessingContext(reportDate);
    const output = await buildDailyReportOutput(reportDate, refreshed);
    const generatedAt = new Date();

    await db
      .update(dailyReports)
      .set({
        status: "succeeded",
        summary: output.summary,
        highLevelDone: JSON.stringify(output.highLevelDone),
        frictionHighlights: JSON.stringify(output.frictionHighlights),
        topSuggestions: JSON.stringify(output.topSuggestions),
        sessionCount: refreshed.sessions.length,
        eventCount: refreshed.totalEventCount,
        processedSessionIds: JSON.stringify(
          refreshed.sessions.map((session) => session.sessionId)
        ),
        lastProcessedEventId: refreshed.latestDayEventId,
        errorMessage: null,
        generatedAt,
        updatedAt: generatedAt,
      })
      .where(eq(dailyReports.reportDate, reportDate))
      .run();
  } catch (error) {
    await db
      .update(dailyReports)
      .set({
        status: "failed",
        errorMessage: toErrorMessage(error),
        updatedAt: new Date(),
      })
      .where(eq(dailyReports.reportDate, reportDate))
      .run();
    throw error;
  }
}

export async function getDailyReport(reportDate: string) {
  validateReportDate(reportDate);
  const [row] = await db
    .select()
    .from(dailyReports)
    .where(eq(dailyReports.reportDate, reportDate))
    .limit(1);

  return row ? parseDailyReportRow(row) : null;
}

function parseDailyReportRow(row: typeof dailyReports.$inferSelect): ParsedDailyReport {
  return {
    reportDate: row.reportDate,
    status: normalizeReportStatus(row.status),
    summary: row.summary,
    highLevelDone: parseJsonArray<string>(row.highLevelDone),
    frictionHighlights: parseJsonArray<DailyReport["frictionHighlights"][number]>(
      row.frictionHighlights
    ),
    topSuggestions: parseJsonArray<DailyReport["topSuggestions"][number]>(
      row.topSuggestions
    ),
    sessionCount: row.sessionCount ?? 0,
    eventCount: row.eventCount ?? 0,
    processedSessionIds: parseJsonArray<string>(row.processedSessionIds),
    lastProcessedEventId: row.lastProcessedEventId ?? null,
    errorMessage: row.errorMessage,
    autoTriggeredAt: row.autoTriggeredAt ?? null,
    generatedAt: row.generatedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeReportStatus(value: string | null): ReportStatus {
  if (
    value === "idle" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed"
  ) {
    return value;
  }

  return "idle";
}

async function getRecentActivityDays(limit: number): Promise<ActivityDayRow[]> {
  const dayExpr = sql<string>`date(${events.timestamp}, 'unixepoch', 'localtime')`;

  const rows = await db
    .select({
      day: dayExpr,
      eventCount: sql<number>`count(*)`,
      latestEventId: sql<number>`max(${events.id})`,
    })
    .from(events)
    .innerJoin(sessions, eq(sessions.id, events.sessionId))
    .where(visibleSessionsCondition())
    .groupBy(dayExpr)
    .orderBy(desc(dayExpr))
    .limit(limit);

  return rows.map((row) => ({
    day: row.day,
    eventCount: row.eventCount ?? 0,
    latestEventId: row.latestEventId ?? 0,
  }));
}

async function claimAutoTrigger(reportDate: string, now: Date) {
  await db
    .insert(dailyReports)
    .values({
      reportDate,
      status: "idle",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();

  const claimed = await db
    .update(dailyReports)
    .set({
      autoTriggeredAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(dailyReports.reportDate, reportDate),
        isNull(dailyReports.autoTriggeredAt)
      )
    )
    .returning({
      reportDate: dailyReports.reportDate,
    });

  return claimed.length > 0;
}

async function getDaySessionActivity(
  reportDate: string
): Promise<DaySessionActivity[]> {
  const { start, end } = getLocalDayBounds(reportDate);

  const rows = await db
    .select({
      sessionId: sessions.id,
      sessionName: sessions.sessionName,
      sessionGroup: sessions.sessionGroup,
      source: sessions.source,
      model: sessions.model,
      summary: sessions.summary,
      summaryLastProcessedEventId: sessions.summaryLastProcessedEventId,
      latestDayEventId: sql<number>`max(${events.id})`,
      dayEventCount: sql<number>`count(${events.id})`,
      firstEventAt: sql<Date>`min(${events.timestamp})`,
      lastEventAt: sql<Date>`max(${events.timestamp})`,
    })
    .from(events)
    .innerJoin(sessions, eq(sessions.id, events.sessionId))
    .where(
      and(
        visibleSessionsCondition(),
        gte(events.timestamp, start),
        lt(events.timestamp, end)
      )
    )
    .groupBy(
      sessions.id,
      sessions.sessionName,
      sessions.sessionGroup,
      sessions.source,
      sessions.model,
      sessions.summary,
      sessions.summaryLastProcessedEventId
    )
    .orderBy(asc(sql<Date>`min(${events.timestamp})`));

  return rows
    .filter(
      (row) =>
        row.firstEventAt !== null &&
        row.lastEventAt !== null &&
        row.latestDayEventId !== null
    )
    .map((row) => ({
      sessionId: row.sessionId,
      latestDayEventId: row.latestDayEventId,
      dayEventCount: row.dayEventCount ?? 0,
      firstEventAt: new Date(row.firstEventAt as unknown as string),
      lastEventAt: new Date(row.lastEventAt as unknown as string),
      sessionName: row.sessionName,
      sessionGroup: row.sessionGroup,
      source: row.source,
      model: row.model,
      summary: row.summary,
      summaryLastProcessedEventId: row.summaryLastProcessedEventId ?? null,
    }));
}

async function getLatestDecisionStatesForDay(reportDate: string) {
  const sessionsForDay = await getDaySessionActivity(reportDate);
  const sessionIds = sessionsForDay.map((session) => session.sessionId);

  if (sessionIds.length === 0) {
    return new Map<
      string,
      {
        hasSuccessfulRun: boolean;
        latestStatus: string | null;
        latestSuccessfulProcessedEventId: number | null;
      }
    >();
  }

  const rows = await db
    .select({
      sessionId: decisionRuns.sessionId,
      status: decisionRuns.status,
      id: decisionRuns.id,
      startedAt: decisionRuns.startedAt,
      lastProcessedEventId: decisionRuns.lastProcessedEventId,
    })
    .from(decisionRuns)
    .where(inArray(decisionRuns.sessionId, sessionIds))
    .orderBy(desc(decisionRuns.startedAt), desc(decisionRuns.id));

  const states = new Map<
    string,
    {
      hasSuccessfulRun: boolean;
      latestStatus: string | null;
      latestSuccessfulProcessedEventId: number | null;
    }
  >();

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

    if (current.latestStatus === null) {
      current.latestStatus = row.status;
    }

    if (!current.hasSuccessfulRun && row.status === "succeeded") {
      current.hasSuccessfulRun = true;
      current.latestSuccessfulProcessedEventId = row.lastProcessedEventId ?? null;
    }
  }

  return states;
}

async function failStaleRunningDecisionRunsForDay(reportDate: string) {
  const sessionsForDay = await getDaySessionActivity(reportDate);
  const sessionIds = sessionsForDay.map((session) => session.sessionId);

  if (sessionIds.length === 0) {
    return;
  }

  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const staleRuns = await db
    .select({
      id: decisionRuns.id,
    })
    .from(decisionRuns)
    .where(
      and(
        inArray(decisionRuns.sessionId, sessionIds),
        eq(decisionRuns.status, "running"),
        lt(decisionRuns.startedAt, cutoff)
      )
    );

  if (staleRuns.length === 0) {
    return;
  }

  for (const run of staleRuns) {
    await db
      .update(decisionRuns)
      .set({
        status: "failed",
        endedAt: new Date(),
        errorMessage:
          "Decision extraction stopped making progress and was marked failed.",
      })
      .where(eq(decisionRuns.id, run.id))
      .run();
  }
}

async function getDailyProcessingContext(reportDate: string) {
  const daySessions = await getDaySessionActivity(reportDate);
  const sessionIds = daySessions.map((session) => session.sessionId);
  const { start, end } = getLocalDayBounds(reportDate);

  const [dayEvents, dayDecisions, latestDecisionStates] = await Promise.all([
    sessionIds.length === 0
      ? Promise.resolve([] as DayEventRow[])
      : db
          .select({
            id: events.id,
            sessionId: events.sessionId,
            eventType: events.eventType,
            toolName: events.toolName,
            toolInput: events.toolInput,
            failureOperation: events.failureOperation,
            failureType: events.failureType,
            timestamp: events.timestamp,
          })
          .from(events)
          .where(
            and(
              inArray(events.sessionId, sessionIds),
              gte(events.timestamp, start),
              lt(events.timestamp, end)
            )
          )
          .orderBy(asc(events.id)),
    sessionIds.length === 0
      ? Promise.resolve([] as RawDayDecisionRow[])
      : db
          .select({
            sessionId: decisions.sessionId,
            category: decisions.category,
            decision: decisions.decision,
            whyPivotal: decisions.whyPivotal,
            evidenceEventIds: decisions.evidenceEventIds,
            whatFailed: decisions.whatFailed,
          })
          .from(decisions)
          .where(inArray(decisions.sessionId, sessionIds)),
    getLatestDecisionStatesForDay(reportDate),
  ]);

  const eventIdsBySession = new Map<string, Set<number>>();
  for (const event of dayEvents) {
    const ids = eventIdsBySession.get(event.sessionId) ?? new Set<number>();
    ids.add(event.id);
    eventIdsBySession.set(event.sessionId, ids);
  }

  const filteredDecisions = dayDecisions
    .map((row) => ({
      ...row,
      evidenceEventIds: parseJsonArray<number>(row.evidenceEventIds),
      whatFailed: parseJsonObject(row.whatFailed),
    }))
    .filter((row) => {
      const ids = eventIdsBySession.get(row.sessionId);
      return row.evidenceEventIds.some((eventId) => ids?.has(eventId));
    });

  const totalEventCount = dayEvents.length;
  const latestDayEventId =
    dayEvents.length > 0 ? dayEvents[dayEvents.length - 1]?.id ?? null : null;

  return {
    sessions: daySessions,
    dayEvents,
    decisions: filteredDecisions,
    latestDecisionStates,
    totalEventCount,
    latestDayEventId,
  };
}

async function buildDailyReportOutput(
  reportDate: string,
  context: Awaited<ReturnType<typeof getDailyProcessingContext>>
): Promise<DailyReport> {
  if (context.sessions.length === 0) {
    return {
      summary: "No visible agent activity was recorded for this day.",
      highLevelDone: [],
      frictionHighlights: [],
      topSuggestions: [],
    };
  }

  const sessionLines = context.sessions.map((session, index) => {
    const tools = summarizeSessionTools(session.sessionId, context.dayEvents);
    const skills = summarizeSessionSkills(session.sessionId, context.dayEvents);

    return [
      `Session ${index + 1}`,
      `id=${session.sessionId}`,
      session.sessionName ? `name=${cleanInline(session.sessionName, 120)}` : null,
      session.sessionGroup ? `group=${cleanInline(session.sessionGroup, 120)}` : null,
      session.source ? `source=${session.source}` : null,
      session.model ? `model=${session.model}` : null,
      `events=${session.dayEventCount}`,
      `window=${session.firstEventAt.toISOString()}..${session.lastEventAt.toISOString()}`,
      tools.length > 0 ? `tools=${tools.join(", ")}` : null,
      skills.length > 0 ? `skills=${skills.join(", ")}` : null,
      session.summary
        ? `session_summary=${cleanInline(session.summary, 600)}`
        : "session_summary=missing",
    ]
      .filter(Boolean)
      .join(" | ");
  });

  const frictionLines = context.decisions
    .filter((decision) => decision.category === "friction")
    .map((decision, index) => {
      const detail = decision.whatFailed;
      const attempts = Array.isArray(detail?.attempts)
        ? (detail.attempts as Array<Record<string, unknown>>)
        : [];
      const firstAttempt = attempts[0] ?? null;
      const toolName =
        typeof firstAttempt?.tool === "string" && firstAttempt.tool.trim()
          ? firstAttempt.tool.trim()
          : null;
      const sessionSkills = summarizeSessionSkills(decision.sessionId, context.dayEvents);

      return [
        `Friction ${index + 1}`,
        `session=${decision.sessionId}`,
        toolName ? `tool=${toolName}` : null,
        sessionSkills.length > 0 ? `candidate_skills=${sessionSkills.join(", ")}` : null,
        `summary=${cleanInline(decision.decision, 240)}`,
        `why=${cleanInline(decision.whyPivotal, 300)}`,
        attempts.length > 0
          ? `attempts=${attempts
              .slice(0, 3)
              .map((attempt) =>
                [
                  typeof attempt.event_id === "number" ? `#${attempt.event_id}` : null,
                  typeof attempt.tool === "string" ? attempt.tool : null,
                  typeof attempt.error === "string"
                    ? cleanInline(attempt.error, 140)
                    : null,
                ]
                  .filter(Boolean)
                  .join(":")
              )
              .join("; ")}`
          : null,
        detail?.resolution ? `has_resolution=true` : "has_resolution=false",
      ]
        .filter(Boolean)
        .join(" | ");
    });

  const system = `You create a daily report for coding agent activity.

Return JSON only.

Goals:
1. Summarize what got done at a high level.
2. Highlight the most important friction from the day.
3. Suggest up to 3 ways to reduce future friction by improving the environment, setup, or skills used.

Rules:
- Base the report on the provided session summaries and day-level friction evidence.
- Suggestions must be concrete and tied to the friction evidence.
- Only suggest environment/setup/skill improvements. Do not suggest product or feature work.
- If evidence is weak or one-off, return fewer suggestions or an empty array.
- Skill attribution is often only session-level. Do not claim a specific skill caused friction unless the evidence is clear.
- Prefer durable improvements like missing tooling, shell/platform mismatch, poor defaults, missing docs, wrong skill choice, or repetitive command patterns.`;

  const prompt = [
    `Report date: ${reportDate}`,
    `Session count: ${context.sessions.length}`,
    `Event count: ${context.totalEventCount}`,
    "",
    "Sessions:",
    sessionLines.join("\n"),
    "",
    "Friction evidence:",
    frictionLines.length > 0 ? frictionLines.join("\n") : "none",
  ].join("\n");

  const { output } = await generateText({
    model: getModelConfig().summary,
    output: Output.object({ schema: dailyReportSchema }),
    system,
    prompt: truncate(prompt, 24_000),
  });

  if (!output) {
    throw new Error("daily_report_empty_output");
  }

  return output;
}

function summarizeSessionTools(sessionId: string, rows: DayEventRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.sessionId !== sessionId || !row.toolName || row.eventType !== "tool_pre") {
      continue;
    }

    const toolName = row.toolName.trim();
    if (!toolName) continue;
    counts.set(toolName, (counts.get(toolName) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, count]) => `${name} x${count}`);
}

function summarizeSessionSkills(sessionId: string, rows: DayEventRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.sessionId !== sessionId || row.eventType !== "tool_pre") {
      continue;
    }

    if (row.toolName?.trim() !== "Skill") {
      continue;
    }

    const skillName = parseSkillName(row.toolInput);
    if (!skillName) continue;
    counts.set(skillName, (counts.get(skillName) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([name, count]) => `${name} x${count}`);
}

function parseSkillName(raw: string | null): string | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed === "string") {
      const value = parsed.trim();
      return value || null;
    }

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const object = parsed as Record<string, unknown>;
    const candidates = [object.skill, object.skillName, object.name];

    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const value = candidate.trim();
      if (value) return value;
    }

    if (object.skill && typeof object.skill === "object") {
      const nested = object.skill as Record<string, unknown>;
      for (const candidate of [nested.name, nested.path]) {
        if (typeof candidate !== "string") continue;
        const value = candidate.trim();
        if (value) return value;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function cleanInline(value: string, max: number) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}...`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return cleanInline(error.message, 800);
  }

  if (typeof error === "string") {
    return cleanInline(error, 800);
  }

  return "Daily report processing failed";
}

function validateReportDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`invalid_report_date:${value}`);
  }
}

export function formatLocalDay(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPreviousLocalDay(date: Date) {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return formatLocalDay(previous);
}

export function getLocalDayBounds(reportDate: string) {
  validateReportDate(reportDate);
  const [year, month, day] = reportDate.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start, end };
}

export type { DailyReportState, ParsedDailyReport };
