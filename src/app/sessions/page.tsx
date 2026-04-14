import { db } from "@/db";
import { sessions } from "@/db/schema";
import { desc, sql, and, eq, or } from "drizzle-orm";
import { SessionCard } from "@/components/session-card";
import { SearchInput } from "@/components/search-input";
import { SessionBatchActions } from "@/components/session-batch-actions";
import { Card } from "@/components/ui/card";
import { Suspense } from "react";
import { visibleSessionsCondition } from "@/lib/session-visibility";
import {
  getLatestSessionDecisionStates,
  getLatestSessionEventIds,
  getSessionInsightCounts,
  getSessionsWithSuccessfulDecisionRuns,
} from "@/lib/session-ai-state";

export const dynamic = "force-dynamic";

const LIMIT = 200;

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; source?: string }>;
}) {
  const { q, type, source } = await searchParams;

  const conditions = [];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        sql`${sessions.sessionName} LIKE ${pattern}`,
        sql`${sessions.sessionGroup} LIKE ${pattern}`,
        sql`${sessions.cwd} LIKE ${pattern}`,
        sql`${sessions.source} LIKE ${pattern}`,
        sql`${sessions.model} LIKE ${pattern}`,
        sql`${sessions.summary} LIKE ${pattern}`,
        sql`${sessions.id} LIKE ${pattern}`
      )
    );
  }

  if (type) {
    conditions.push(eq(sessions.sessionType, type));
  }

  if (source) {
    conditions.push(eq(sessions.source, source));
  }

  conditions.push(visibleSessionsCondition());

  const results = await db
    .select()
    .from(sessions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sessions.startedAt))
    .limit(LIMIT);

  const sessionsWithDecisions = await getSessionsWithSuccessfulDecisionRuns(
    results.map((session) => session.id)
  );
  const sessionDecisionStates = await getLatestSessionDecisionStates(
    results.map((session) => session.id)
  );
  const sessionLatestEventIds = await getLatestSessionEventIds(
    results.map((session) => session.id)
  );
  const sessionInsightCounts = await getSessionInsightCounts(
    results.map((session) => session.id)
  );
  const summaryRefreshSessionIds = results
    .filter((session) => {
      const latestEventId = sessionLatestEventIds.get(session.id) ?? null;
      return (
        latestEventId !== null &&
        (session.summaryLastProcessedEventId ?? 0) < latestEventId
      );
    })
    .map((session) => session.id);
  const summaryRefreshSessionIdSet = new Set(summaryRefreshSessionIds);
  const summarySessionIds = results
    .filter(
      (session) =>
        !session.summary || summaryRefreshSessionIdSet.has(session.id)
    )
    .map((session) => session.id);
  const decisionRefreshSessionIds = results
    .filter((session) => {
      const latestEventId = sessionLatestEventIds.get(session.id) ?? null;
      const decisionState = sessionDecisionStates.get(session.id);

      return (
        latestEventId !== null &&
        Boolean(decisionState?.hasSuccessfulRun) &&
        (decisionState?.latestSuccessfulProcessedEventId ?? 0) < latestEventId
      );
    })
    .map((session) => session.id);
  const decisionRefreshSessionIdSet = new Set(decisionRefreshSessionIds);
  const decisionSessionIds = results
    .filter(
      (session) =>
        (!sessionsWithDecisions.has(session.id) ||
          decisionRefreshSessionIdSet.has(session.id)) &&
        sessionDecisionStates.get(session.id)?.latestStatus !== "running"
    )
    .map((session) => session.id);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center gap-8 mb-6">
        <h1 className="text-[24px] font-semibold tracking-tight">Sessions</h1>
        <span className="text-[13px] text-gray-900">
          <strong className="text-gray-1000">{results.length}</strong>
          {results.length === LIMIT ? "+" : ""} session
          {results.length !== 1 ? "s" : ""}
          {q ? ` matching \u201c${q}\u201d` : ""}
        </span>
      </div>

      <div className="mb-6">
        <Suspense>
          <SearchInput placeholder="Search by name, group, source, model, path..." />
        </Suspense>
      </div>

      {results.length > 0 && (
        <div className="mb-6">
          <SessionBatchActions
            summarySessionIds={summarySessionIds}
            decisionSessionIds={decisionSessionIds}
            highlightSummaryRefresh={summaryRefreshSessionIds.length > 0}
            highlightDecisionRefresh={decisionRefreshSessionIds.length > 0}
          />
        </div>
      )}

      {results.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-[15px] text-gray-900">No sessions found</p>
          <p className="text-[13px] text-gray-700 mt-1">
            {q
              ? "Try a different search term."
              : "Sessions are recorded when agent hooks are installed."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((s) => {
            const insightCounts = sessionInsightCounts.get(s.id) ?? {
              decisionCount: 0,
              frictionCount: 0,
            };
            const decisionState = sessionDecisionStates.get(s.id);
            const latestEventId = sessionLatestEventIds.get(s.id) ?? null;
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
              hasDecisions={sessionsWithDecisions.has(s.id)}
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
  );
}
