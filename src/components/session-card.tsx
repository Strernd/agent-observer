import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SessionTypeBadge, SourceBadge } from "./badge";
import { timeAgo, duration } from "@/lib/format";
import { resolveSessionExtraction } from "@/lib/session-extraction";
import { SessionAiActions } from "./session-ai-actions";

interface SessionCardProps {
  id: string;
  cwd: string | null;
  sessionName: string | null;
  sessionGroup: string | null;
  extractedData?: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  eventCount: number;
  source: string | null;
  model: string | null;
  sessionType: string | null;
  ticketId: string | null;
  summary: string | null;
  summaryNeedsRefresh: boolean;
  hasDecisions: boolean;
  decisionsNeedRefresh: boolean;
  isDecisionRunning: boolean;
  decisionCount: number;
  frictionCount: number;
}

export function SessionCard({
  id,
  cwd,
  sessionName,
  sessionGroup,
  extractedData,
  startedAt,
  endedAt,
  eventCount,
  source,
  model,
  sessionType,
  ticketId,
  summary,
  summaryNeedsRefresh,
  hasDecisions,
  decisionsNeedRefresh,
  isDecisionRunning,
  decisionCount,
  frictionCount,
}: SessionCardProps) {
  const derived = resolveSessionExtraction({
    cwd,
    extractedData,
    model,
    sessionGroup,
    sessionName,
    source,
    ticketId,
  });
  const displayName = derived.sessionName ?? "unknown";

  return (
    <Card className="p-4 transition-colors hover:border-gray-500">
      <Link href={`/sessions/${id}`} className="block">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-gray-1000">
              {displayName}
            </span>
            <SourceBadge source={source} />
            <SessionTypeBadge type={sessionType} />
            {derived.sessionGroup && (
              <span className="text-[11px] text-gray-700">
                {derived.sessionGroup}
              </span>
            )}
            {derived.ticketId && (
              <span className="text-[11px] font-mono text-blue-700">
                {derived.ticketId}
              </span>
            )}
          </div>
          <span className="text-[12px] font-mono text-gray-900">
            {startedAt ? timeAgo(startedAt) : "unknown"}
          </span>
        </div>

        {cwd && (
          <p className="mb-3 line-clamp-1 font-mono text-[11px] text-gray-700">
            {cwd}
          </p>
        )}

        {summary && (
          <p className="mb-3 line-clamp-2 text-[13px] text-gray-900">
            {summary}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-700">
          <span>{eventCount} events</span>
          <span>{decisionCount} decisions</span>
          <span>{frictionCount} frictions</span>
          {startedAt && <span>{duration(startedAt, endedAt)}</span>}
          {model && <span className="font-mono">{model}</span>}
          <span className="font-mono text-gray-600">{id.slice(0, 8)}</span>
        </div>
      </Link>

      {(Boolean(summary) === false ||
        summaryNeedsRefresh ||
        hasDecisions === false ||
        decisionsNeedRefresh ||
        isDecisionRunning) && (
        <div className="mt-3 flex justify-end border-t border-gray-200 pt-3">
          <SessionAiActions
            sessionId={id}
            hasSummary={Boolean(summary)}
            summaryNeedsRefresh={summaryNeedsRefresh}
            hasDecisions={hasDecisions}
            decisionsNeedRefresh={decisionsNeedRefresh}
            isDecisionRunning={isDecisionRunning}
          />
        </div>
      )}
    </Card>
  );
}
