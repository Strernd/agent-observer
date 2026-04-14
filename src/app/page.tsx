import { stat } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { events, sessions, tickets } from "@/db/schema";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { SessionCard } from "@/components/session-card";
import { TicketCard } from "@/components/ticket-card";
import type { TicketArtifactMenuItem } from "@/components/ticket-artifacts-menu";
import { ActivityGraph } from "@/components/activity-graph";
import { Card } from "@/components/ui/card";
import { LastDayOverview } from "@/components/last-day-overview";
import type { OutputArtifact } from "@/lib/ai/schemas";
import { DailyReportTrigger } from "@/components/daily-report-trigger";
import {
  getDailyReportState,
  getPreviousLocalDay,
} from "@/lib/daily-reports";
import { formatBytes } from "@/lib/format";
import Link from "next/link";
import { visibleSessionsCondition } from "@/lib/session-visibility";
import {
  getLatestSessionDecisionStates,
  getLatestSessionEventIds,
  getLatestSessionGroupEventIds,
  getLatestTicketEventIds,
  getSessionInsightCounts,
  getSessionsWithSuccessfulDecisionRuns,
} from "@/lib/session-ai-state";
import {
  buildGroupWorkItemId,
  deriveSessionGroupCustomer,
  deriveSessionGroupTitle,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";

type WorkItemListRow = {
  routeId: string;
  id: string;
  customer: string;
  title: string | null;
  currentState: string | null;
  progress: string | null;
  summaryLastProcessedEventId: number | null;
  sessionCount: number;
  latestActivity: number | null;
};

export default async function OverviewPage() {
  const latestActivityExpr = sql<number>`max(coalesce(${events.timestamp}, coalesce(${sessions.endedAt}, ${sessions.startedAt}))) * 1000`;
  const realTicketRows = await db
    .select({
      id: tickets.id,
      customer: tickets.customer,
      title: tickets.title,
      currentState: tickets.summaryCurrentState,
      progress: tickets.summaryProgress,
      summaryLastProcessedEventId: tickets.summaryLastProcessedEventId,
      sessionCount: sql<number>`count(distinct ${sessions.id})`,
      latestActivity: latestActivityExpr,
    })
    .from(tickets)
    .innerJoin(
      sessions,
      and(eq(sessions.ticketId, tickets.id), visibleSessionsCondition())
    )
    .leftJoin(events, eq(events.sessionId, sessions.id))
    .groupBy(tickets.id)
    .orderBy(desc(latestActivityExpr))
    .limit(10);
  const sessionGroupRows = await db
    .select({
      sessionGroup: sessions.sessionGroup,
      sessionCount: sql<number>`count(distinct ${sessions.id})`,
      latestActivity: latestActivityExpr,
    })
    .from(sessions)
    .leftJoin(events, eq(events.sessionId, sessions.id))
    .where(and(isNull(sessions.ticketId), isNotNull(sessions.sessionGroup), visibleSessionsCondition()))
    .groupBy(sessions.sessionGroup)
    .orderBy(desc(latestActivityExpr))
    .limit(10);
  const groupSummaryIds = sessionGroupRows
    .map((row) => row.sessionGroup)
    .filter((value): value is string => typeof value === "string")
    .map((sessionGroup) => buildGroupWorkItemId(sessionGroup));
  const groupSummaryRows =
    groupSummaryIds.length > 0
      ? await db
          .select({
            id: tickets.id,
            customer: tickets.customer,
            title: tickets.title,
            currentState: tickets.summaryCurrentState,
            progress: tickets.summaryProgress,
            summaryLastProcessedEventId: tickets.summaryLastProcessedEventId,
          })
          .from(tickets)
          .where(inArray(tickets.id, groupSummaryIds))
      : [];
  const groupSummaryById = new Map(groupSummaryRows.map((row) => [row.id, row]));
  const realTicketIds = realTicketRows
    .map((ticket) => ticket.id)
    .filter((value): value is string => typeof value === "string");
  const realWorkItems: WorkItemListRow[] = realTicketRows
    .filter(
      (ticket): ticket is typeof ticket & { id: string; customer: string } =>
        typeof ticket.id === "string" && typeof ticket.customer === "string"
    )
    .map((ticket) => ({
      routeId: ticket.id,
      id: ticket.id,
      customer: ticket.customer,
      title: ticket.title,
      currentState: ticket.currentState,
      progress: ticket.progress,
      summaryLastProcessedEventId: ticket.summaryLastProcessedEventId,
      sessionCount: ticket.sessionCount,
      latestActivity: ticket.latestActivity,
    }));
  const ticketList: WorkItemListRow[] = [
    ...realWorkItems,
    ...sessionGroupRows.flatMap((row) => {
      if (typeof row.sessionGroup !== "string") {
        return [];
      }

      const sessionGroup = row.sessionGroup;
      const routeId = buildGroupWorkItemId(sessionGroup);
      const summaryRow = groupSummaryById.get(routeId);
      return [
        {
          routeId,
          id: sessionGroup,
          customer:
            summaryRow?.customer ?? deriveSessionGroupCustomer(sessionGroup),
          title: summaryRow?.title ?? deriveSessionGroupTitle(sessionGroup),
          currentState: summaryRow?.currentState ?? null,
          progress: summaryRow?.progress ?? null,
          summaryLastProcessedEventId:
            summaryRow?.summaryLastProcessedEventId ?? null,
          sessionCount: row.sessionCount,
          latestActivity: row.latestActivity,
        },
      ];
    }),
  ]
    .sort((a, b) => (b.latestActivity ?? 0) - (a.latestActivity ?? 0))
    .slice(0, 10);

  const untaggedSessions = await db
    .select()
    .from(sessions)
    .where(and(isNull(sessions.ticketId), isNull(sessions.sessionGroup), visibleSessionsCondition()))
    .orderBy(desc(sessions.startedAt))
    .limit(10);
  const untaggedSessionsWithDecisions =
    await getSessionsWithSuccessfulDecisionRuns(
      untaggedSessions.map((session) => session.id)
    );
  const untaggedSessionDecisionStates = await getLatestSessionDecisionStates(
    untaggedSessions.map((session) => session.id)
  );
  const untaggedSessionLatestEventIds = await getLatestSessionEventIds(
    untaggedSessions.map((session) => session.id)
  );
  const untaggedSessionInsightCounts = await getSessionInsightCounts(
    untaggedSessions.map((session) => session.id)
  );
  const ticketLatestEventIds = await getLatestTicketEventIds(
    realTicketIds
  );
  const sessionGroupLatestEventIds = await getLatestSessionGroupEventIds(
    sessionGroupRows
      .map((row) => row.sessionGroup)
      .filter((value): value is string => typeof value === "string")
  );
  const sessionArtifactsByTicket = new Map<string, TicketArtifactMenuItem[]>();

  if (realTicketIds.length > 0) {
    const sessionArtifactRows = await db
      .select({
        ticketId: sessions.ticketId,
        sessionId: sessions.id,
        outputArtifacts: sessions.outputArtifacts,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(
        and(
          inArray(
            sessions.ticketId,
            realTicketIds
          ),
          visibleSessionsCondition()
        )
      )
      .orderBy(desc(sessions.startedAt));

    for (const row of sessionArtifactRows) {
      if (!row.ticketId) continue;
      const existing = sessionArtifactsByTicket.get(row.ticketId) ?? [];
      const seenPaths = new Set(existing.map((artifact) => artifact.path));

      for (const artifact of parseJsonArray<OutputArtifact>(row.outputArtifacts)) {
        if (seenPaths.has(artifact.path)) continue;
        seenPaths.add(artifact.path);
        existing.push({
          path: artifact.path,
          sessionId: row.sessionId,
        });
      }

      sessionArtifactsByTicket.set(row.ticketId, existing);
    }
  }

  const sessionGroups = sessionGroupRows
    .map((row) => row.sessionGroup)
    .filter((value): value is string => typeof value === "string");
  if (sessionGroups.length > 0) {
    const sessionArtifactRows = await db
      .select({
        sessionGroup: sessions.sessionGroup,
        sessionId: sessions.id,
        outputArtifacts: sessions.outputArtifacts,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(
        and(
          inArray(sessions.sessionGroup, sessionGroups),
          isNull(sessions.ticketId),
          visibleSessionsCondition()
        )
      )
      .orderBy(desc(sessions.startedAt));

    for (const row of sessionArtifactRows) {
      if (!row.sessionGroup) continue;
      const routeId = buildGroupWorkItemId(row.sessionGroup);
      const existing = sessionArtifactsByTicket.get(routeId) ?? [];
      const seenPaths = new Set(existing.map((artifact) => artifact.path));

      for (const artifact of parseJsonArray<OutputArtifact>(row.outputArtifacts)) {
        if (seenPaths.has(artifact.path)) continue;
        seenPaths.add(artifact.path);
        existing.push({
          path: artifact.path,
          sessionId: row.sessionId,
        });
      }

      sessionArtifactsByTicket.set(routeId, existing);
    }
  }

  const [stats] = await db
    .select({
      totalSessions: count(sessions.id),
      totalEvents: sql<number>`(
        SELECT count(*)
        FROM events
        INNER JOIN sessions ON sessions.id = events.session_id
        WHERE ${visibleSessionsCondition()}
      )`,
    })
    .from(sessions)
    .where(visibleSessionsCondition());

  const dbDiskUsage = await getSqliteDiskUsage();

  const hasData = (stats?.totalSessions ?? 0) > 0;
  const latestReportDate = hasData ? getPreviousLocalDay(new Date()) : null;
  const latestDailyReportState =
    latestReportDate ? await getDailyReportState(latestReportDate) : null;

  // Activity heatmap: hourly event counts for last 14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const dayExpr = sql<string>`date(${events.timestamp}, 'unixepoch', 'localtime')`;
  const hourExpr = sql<number>`cast(strftime('%H', ${events.timestamp}, 'unixepoch', 'localtime') as integer)`;

  const hourlyActivity = hasData
    ? await db
        .select({ day: dayExpr, hour: hourExpr, count: sql<number>`count(*)` })
        .from(events)
        .innerJoin(sessions, eq(sessions.id, events.sessionId))
        .where(and(gte(events.timestamp, fourteenDaysAgo), visibleSessionsCondition()))
        .groupBy(dayExpr, hourExpr)
    : [];

  // Generate last 14 days in local time (most recent first)
  const activityDays: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    activityDays.push(`${y}-${m}-${day}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center gap-8 mb-8">
        <h1 className="text-[24px] font-semibold tracking-tight">Overview</h1>
        <div className="flex items-center gap-6 text-[13px] text-gray-900">
          <span>
            <strong className="text-gray-1000">
              {stats?.totalSessions ?? 0}
            </strong>{" "}
            sessions
          </span>
          <span>
            <strong className="text-gray-1000">
              {stats?.totalEvents ?? 0}
            </strong>{" "}
            events
          </span>
          <span>
            <strong className="text-gray-1000">{ticketList.length}</strong>{" "}
            work items
          </span>
          <span>
            <strong className="text-gray-1000">{formatBytes(dbDiskUsage)}</strong>{" "}
            db
          </span>
        </div>
      </div>

      {!hasData && (
        <Card className="p-10 text-center">
          <p className="text-[15px] text-gray-900 mb-2">
            No sessions recorded yet
          </p>
          <p className="text-[13px] text-gray-700">
            Run{" "}
            <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">
              pnpm run install-claude-hooks
            </code>{" "}
            to start recording agent activity.
          </p>
        </Card>
      )}

      {hasData && (
        <>
        {latestDailyReportState && (
          <LastDayOverview
            header={
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-[18px] font-semibold text-gray-1000">
                    Last Day Overview
                  </h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                    {formatReportDate(latestDailyReportState.reportDate)}
                  </span>
                  {latestDailyReportState.report?.status ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                      {latestDailyReportState.report.status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-gray-700">
                  AI-assembled overview for the latest day with recorded activity.
                </p>
              </div>
            }
            actions={
              <div className="flex items-center gap-3">
                <Link
                  href={`/reports/${latestDailyReportState.reportDate}`}
                  className="text-[13px] text-gray-700 transition-colors hover:text-gray-1000"
                >
                  Full report &rarr;
                </Link>
                <DailyReportTrigger
                  reportDate={latestDailyReportState.reportDate}
                  initialStatus={latestDailyReportState.report?.status ?? "idle"}
                  needsProcessing={latestDailyReportState.needsProcessing}
                  summaryTargetCount={latestDailyReportState.summaryTargetCount}
                  decisionTargetCount={latestDailyReportState.decisionTargetCount}
                  runningDecisionCount={latestDailyReportState.runningDecisionCount}
                />
              </div>
            }
          >
            <div className="grid gap-6 px-6 py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-gray-600">
                  Day Summary
                </p>
                <p className="mt-2 text-[14px] leading-7 text-gray-800">
                  {latestDailyReportState.report?.summary ??
                    "No stored day report yet. Run processing to summarize the day and store it in Reports."}
                </p>

                {latestDailyReportState.report?.highLevelDone?.length ? (
                  <div className="mt-5">
                    <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-gray-600">
                      What Was Done
                    </p>
                    <ul className="mt-2 space-y-2 text-[14px] text-gray-800">
                      {latestDailyReportState.report.highLevelDone
                        .slice(0, 4)
                        .map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                            <span>{item}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-5">
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-gray-600">
                    Friction Highlights
                  </p>
                  <div className="mt-2 space-y-3">
                    {latestDailyReportState.report?.frictionHighlights?.length ? (
                      latestDailyReportState.report.frictionHighlights
                        .slice(0, 3)
                        .map((item) => (
                          <div key={`${item.severity}-${item.title}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[13px] font-medium text-gray-1000">
                                {item.title}
                              </p>
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                {item.severity}
                              </span>
                            </div>
                            <p className="mt-1 text-[13px] leading-6 text-gray-700">
                              {item.detail}
                            </p>
                          </div>
                        ))
                    ) : (
                      <p className="text-[13px] text-gray-600">
                        No stored friction highlights yet.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-gray-600">
                    Suggestions
                  </p>
                  <div className="mt-2 space-y-3">
                    {latestDailyReportState.report?.topSuggestions?.length ? (
                      latestDailyReportState.report.topSuggestions.map((item) => (
                        <div key={`${item.category}-${item.title}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[13px] font-medium text-gray-1000">
                              {item.title}
                            </p>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                              {item.category}
                            </span>
                          </div>
                          <p className="mt-1 text-[13px] leading-6 text-gray-700">
                            {item.detail}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[13px] text-gray-600">
                        No durable setup or environment suggestions were extracted.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </LastDayOverview>
        )}
        <ActivityGraph data={hourlyActivity} days={activityDays} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[16px] font-semibold">Active Work Items</h2>
              <Link
                href="/tickets"
                className="text-[13px] text-blue-700 hover:underline"
              >
                View all
              </Link>
            </div>
            {ticketList.length === 0 ? (
              <p className="text-[13px] text-gray-700">No work items yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ticketList.map((t) => {
                  const latestEventId = t.routeId.startsWith("group:")
                    ? sessionGroupLatestEventIds.get(t.id) ?? null
                    : ticketLatestEventIds.get(t.id) ?? null;
                  const summaryNeedsRefresh =
                    latestEventId !== null &&
                    (t.summaryLastProcessedEventId ?? 0) < latestEventId;

                  return (
                  <TicketCard
                    key={t.routeId}
                    routeId={t.routeId}
                    id={t.id}
                    customer={t.customer}
                    title={t.title}
                    currentState={t.currentState}
                    progress={t.progress}
                    artifacts={sessionArtifactsByTicket.get(t.routeId) ?? []}
                    summaryNeedsRefresh={summaryNeedsRefresh}
                    sessionCount={t.sessionCount}
                    latestActivity={t.latestActivity}
                  />
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[16px] font-semibold">
                Recent Sessions (ungrouped)
              </h2>
              <Link
                href="/sessions"
                className="text-[13px] text-blue-700 hover:underline"
              >
                View all
              </Link>
            </div>
            {untaggedSessions.length === 0 ? (
              <p className="text-[13px] text-gray-700">
                All sessions are grouped
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {untaggedSessions.map((s) => {
                  const insightCounts = untaggedSessionInsightCounts.get(s.id) ?? {
                    decisionCount: 0,
                    frictionCount: 0,
                  };
                  const decisionState = untaggedSessionDecisionStates.get(s.id);
                  const latestEventId = untaggedSessionLatestEventIds.get(s.id) ?? null;
                  const summaryNeedsRefresh =
                    latestEventId !== null &&
                    (s.summaryLastProcessedEventId ?? 0) < latestEventId;
                  const decisionsNeedRefresh =
                    latestEventId !== null &&
                    (decisionState?.latestSuccessfulProcessedEventId ?? 0) < latestEventId &&
                    Boolean(decisionState?.hasSuccessfulRun);

                  return (
                  <SessionCard
                    key={s.id}
                    id={s.id}
                    cwd={s.cwd}
                    sessionName={s.sessionName}
                    sessionGroup={s.sessionGroup}
                    extractedData={s.extractedData}
                    startedAt={s.startedAt}
                    endedAt={s.endedAt}
                    eventCount={s.eventCount}
                    source={s.source}
                    model={s.model}
                    sessionType={s.sessionType}
                    ticketId={s.ticketId}
                    summary={s.summary}
                    summaryNeedsRefresh={summaryNeedsRefresh}
                    hasDecisions={untaggedSessionsWithDecisions.has(s.id)}
                    decisionsNeedRefresh={decisionsNeedRefresh}
                    isDecisionRunning={decisionState?.latestStatus === "running"}
                    decisionCount={insightCounts.decisionCount}
                    frictionCount={insightCounts.frictionCount}
                  />
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}

async function getSqliteDiskUsage() {
  const dbPath = path.join(process.cwd(), "observer.db");
  const candidates = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

  const sizes = await Promise.all(
    candidates.map(async (filePath) => {
      try {
        const file = await stat(filePath);
        return file.size;
      } catch {
        return 0;
      }
    })
  );

  return sizes.reduce((total, size) => total + size, 0);
}

function formatReportDate(reportDate: string) {
  const [year, month, day] = reportDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
