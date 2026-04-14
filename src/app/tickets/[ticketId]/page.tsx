import { db } from "@/db";
import { tickets, sessions } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { SessionCard } from "@/components/session-card";
import { ConfidenceBadge, ToolBadge } from "@/components/badge";
import { notFound } from "next/navigation";
import { buildLinearIssueUrl } from "@/lib/observer-config";
import { visibleSessionsCondition } from "@/lib/session-visibility";
import { TicketSummaryTriggerButton } from "@/components/ticket-summary-trigger-button";
import type { OutputArtifact } from "@/lib/ai/schemas";
import { ArtifactActions } from "@/components/artifact-actions";
import {
  getLatestSessionDecisionStates,
  getLatestSessionEventIds,
  getSessionInsightCounts,
  getSessionsWithSuccessfulDecisionRuns,
} from "@/lib/session-ai-state";
import {
  deriveSessionGroupCustomer,
  deriveSessionGroupTitle,
  parseWorkItemId,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";

interface ToolStat {
  name: string;
  count: number;
}

type SessionArtifacts = {
  sessionId: string;
  sessionLabel: string;
  artifacts: OutputArtifact[];
};

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const workItem = parseWorkItemId(ticketId);

  const [ticket] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, workItem.storageId));

  const sessionList = await db
    .select()
    .from(sessions)
    .where(
      and(
        workItem.kind === "ticket"
          ? eq(sessions.ticketId, workItem.storageId)
          : and(eq(sessions.sessionGroup, workItem.sessionGroup), isNull(sessions.ticketId)),
        visibleSessionsCondition()
      )
    )
    .orderBy(desc(sessions.startedAt));
  const sessionsWithDecisions = await getSessionsWithSuccessfulDecisionRuns(
    sessionList.map((session) => session.id)
  );
  const sessionDecisionStates = await getLatestSessionDecisionStates(
    sessionList.map((session) => session.id)
  );
  const sessionLatestEventIds = await getLatestSessionEventIds(
    sessionList.map((session) => session.id)
  );
  const sessionInsightCounts = await getSessionInsightCounts(
    sessionList.map((session) => session.id)
  );

  if (sessionList.length === 0) return notFound();
  const customer =
    ticket?.customer ??
    (workItem.kind === "group"
      ? deriveSessionGroupCustomer(workItem.sessionGroup)
      : "unknown");
  const displayId = workItem.displayId;
  const title =
    ticket?.title ??
    (workItem.kind === "group"
      ? deriveSessionGroupTitle(workItem.sessionGroup)
      : null);
  const linearIssueUrl =
    workItem.kind === "ticket" ? buildLinearIssueUrl(workItem.displayId) : null;
  const progress = parseJsonArray<string>(ticket?.summaryProgress ?? null);
  const openQuestions = parseJsonArray<string>(ticket?.summaryOpenQuestions ?? null);
  const blockers = parseJsonArray<string>(ticket?.summaryBlockers ?? null);
  const toolStats = parseJsonArray<ToolStat>(ticket?.toolStats ?? null);
  const skillStats = parseJsonArray<ToolStat>(ticket?.skillStats ?? null);
  const visibleToolStats = toolStats.filter(
    (tool) => tool.name !== "Skill" || skillStats.length === 0
  );
  const artifactsBySession = sessionList
    .map<SessionArtifacts | null>((session) => {
      const artifacts = parseJsonArray<OutputArtifact>(session.outputArtifacts);
      if (artifacts.length === 0) return null;

      return {
        sessionId: session.id,
        sessionLabel:
          session.sessionName ?? session.cwd?.split("/").pop() ?? session.id.slice(0, 8),
        artifacts: dedupeArtifacts(artifacts),
      };
    })
    .filter((value): value is SessionArtifacts => value !== null);
  const artifactCount = artifactsBySession.reduce(
    (total, session) => total + session.artifacts.length,
    0
  );
  const hasSummary =
    Boolean(ticket?.summaryCurrentState) ||
    progress.length > 0 ||
    openQuestions.length > 0 ||
    blockers.length > 0 ||
    Boolean(ticket?.summaryNextAction);
  const latestTicketEventId = sessionList.reduce<number | null>((max, session) => {
    const latestEventId = sessionLatestEventIds.get(session.id);
    if (latestEventId === undefined) {
      return max;
    }

    return max === null ? latestEventId : Math.max(max, latestEventId);
  }, null);
  const summaryNeedsRefresh =
    latestTicketEventId !== null &&
    (ticket?.summaryLastProcessedEventId ?? 0) < latestTicketEventId;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[24px] font-semibold tracking-tight font-mono">
            {displayId}
          </h1>
          <span className="text-[16px] text-gray-900 capitalize">
            {customer}
          </span>
          {linearIssueUrl && (
            <a
              href={linearIssueUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-blue-700 hover:underline"
            >
              Open in Linear
            </a>
          )}
        </div>
        {title && (
          <p className="text-[14px] text-gray-900">{title}</p>
        )}
        <p className="text-[13px] text-gray-700 mt-1">
          {sessionList.length} session{sessionList.length !== 1 ? "s" : ""}
        </p>
        {artifactsBySession.length > 0 && (
          <div className="mt-4">
            <h2 className="mb-2 text-[14px] font-semibold text-gray-1000">
              Artifacts
            </h2>
            <p className="mb-3 text-[12px] text-gray-700">
              {artifactCount} output path{artifactCount !== 1 ? "s" : ""} across{" "}
              {artifactsBySession.length} session
              {artifactsBySession.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-4">
              {artifactsBySession.map((sessionArtifacts) => (
                <div key={sessionArtifacts.sessionId}>
                  <div className="mb-2 text-[12px] font-medium text-gray-1000">
                    {sessionArtifacts.sessionLabel}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
                    {sessionArtifacts.artifacts.map((artifact) => (
                      <div key={`${sessionArtifacts.sessionId}:${artifact.path}`}>
                        <ArtifactActions
                          artifactPath={artifact.path}
                          sessionId={sessionArtifacts.sessionId}
                          className="max-w-md"
                        />
                        <div className="text-[11px] text-gray-700">
                          {artifact.sourceTool} event #{artifact.sourceEventId}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Sessions */}
        <div className="lg:col-span-2 flex flex-col gap-2">
          <h2 className="text-[16px] font-semibold mb-3">Sessions</h2>
          {sessionList.map((s) => {
            const insightCounts = sessionInsightCounts.get(s.id) ?? {
              decisionCount: 0,
              frictionCount: 0,
            };
            const decisionState = sessionDecisionStates.get(s.id);
            const latestEventId = sessionLatestEventIds.get(s.id) ?? null;
            const sessionSummaryNeedsRefresh =
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
              summaryNeedsRefresh={sessionSummaryNeedsRefresh}
              hasDecisions={sessionsWithDecisions.has(s.id)}
              decisionsNeedRefresh={decisionsNeedRefresh}
              isDecisionRunning={decisionState?.latestStatus === "running"}
              decisionCount={insightCounts.decisionCount}
              frictionCount={insightCounts.frictionCount}
            />
            );
          })}
        </div>

        {/* Right: Aggregated insights */}
        <div className="space-y-6">
          <div className="flex justify-end">
            <TicketSummaryTriggerButton
              workItemId={workItem.routeId}
              hasSummary={hasSummary}
              needsRefresh={summaryNeedsRefresh}
            />
          </div>

          {hasSummary ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-[14px] font-semibold">Current State</h3>
                <ConfidenceBadge confidence={ticket?.summaryConfidence ?? null} />
              </div>
              {ticket?.summaryCurrentState && (
                <p className="text-[13px] text-gray-900 leading-relaxed">
                  {ticket.summaryCurrentState}
                </p>
              )}

              {progress.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-2 text-[13px] font-medium text-gray-1000">
                    Progress So Far
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-[13px] text-gray-900">
                    {progress.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {openQuestions.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-2 text-[13px] font-medium text-gray-1000">
                    Open Questions
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-[13px] text-gray-900">
                    {openQuestions.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {blockers.length > 0 && (
                <div className="mt-4">
                  <h4 className="mb-2 text-[13px] font-medium text-gray-1000">
                    Blockers & Friction
                  </h4>
                  <ul className="list-disc space-y-1 pl-5 text-[13px] text-gray-900">
                    {blockers.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {ticket?.summaryNextAction && (
                <div className="mt-4">
                  <h4 className="mb-2 text-[13px] font-medium text-gray-1000">
                    Next Best Action
                  </h4>
                  <p className="text-[13px] text-gray-900">
                    {ticket.summaryNextAction}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h3 className="text-[14px] font-semibold mb-2">Current State</h3>
              <p className="text-[13px] text-gray-700">
                No work item summary yet. Generate one when you want a fresh
                cross-session synthesis.
              </p>
            </div>
          )}

          {visibleToolStats.length > 0 && (
            <div>
              <h3 className="text-[14px] font-semibold mb-2">Tool Usage</h3>
              <div className="flex flex-wrap gap-2">
                {visibleToolStats.map((tool) => (
                  <div key={tool.name} className="flex items-center gap-1">
                    <ToolBadge name={tool.name} />
                    <span className="text-[11px] text-gray-700">
                      x{tool.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {skillStats.length > 0 && (
            <div>
              <h3 className="text-[14px] font-semibold mb-2">Skills Used</h3>
              <div className="flex flex-wrap gap-2">
                {skillStats.map((skill) => (
                  <div key={skill.name} className="flex items-center gap-1">
                    <ToolBadge name={skill.name} />
                    <span className="text-[11px] text-gray-700">
                      x{skill.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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

function dedupeArtifacts(artifacts: OutputArtifact[]) {
  const seen = new Set<string>();
  const deduped: OutputArtifact[] = [];

  for (const artifact of artifacts) {
    if (seen.has(artifact.path)) continue;
    seen.add(artifact.path);
    deduped.push(artifact);
  }

  return deduped;
}
