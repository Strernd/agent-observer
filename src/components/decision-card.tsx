import { Card } from "@/components/ui/card";
import { CategoryBadge } from "./badge";
import { formatTime } from "@/lib/format";

interface DecisionCardProps {
  decision: string;
  whyPivotal: string;
  category: string;
  whatFailed: string | Record<string, unknown> | null;
  evidenceEventIds: number[];
  timestamp: Date | string;
}

export function DecisionCard({
  decision,
  whyPivotal,
  category,
  whatFailed,
  evidenceEventIds,
  timestamp,
}: DecisionCardProps) {
  const date =
    typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const detail = normalizeWhatFailed(whatFailed);
  const isFriction = category === "friction" && detail && typeof detail === "object";

  return (
    <Card className="p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <CategoryBadge category={category} />
        <span className="text-[12px] font-mono text-gray-700">
          {formatTime(date)}
        </span>
      </div>

      <p className="mb-2 text-[14px] font-medium text-gray-1000">{decision}</p>
      <p className="text-[13px] text-gray-900">{whyPivotal}</p>

      {isFriction ? (
        <FrictionDetail detail={detail as Record<string, unknown>} evidenceEventIds={evidenceEventIds} />
      ) : detail && category === "autonomous_decision" ? (
        <AutonomousDetail detail={detail as Record<string, unknown>} evidenceEventIds={evidenceEventIds} />
      ) : detail ? (
        <LegacyDetail detail={detail} evidenceEventIds={evidenceEventIds} />
      ) : evidenceEventIds.length > 0 ? (
        <p className="mt-2 text-[11px] text-gray-900 font-mono">
          events: {evidenceEventIds.map((id) => `#${id}`).join(", ")}
        </p>
      ) : null}
    </Card>
  );
}

type Attempt = { event_id?: number; tool?: string; input?: string; error?: string };
type Resolution = { event_id?: number; input?: string };

function FrictionDetail({
  detail,
  evidenceEventIds,
}: {
  detail: Record<string, unknown>;
  evidenceEventIds: number[];
}) {
  const attempts = (Array.isArray(detail.attempts) ? detail.attempts : []) as Attempt[];
  const resolution = detail.resolution as Resolution | null;
  const repeatedLater = detail.repeated_later as boolean | undefined;
  const repeatEventIds = (Array.isArray(detail.repeat_event_ids) ? detail.repeat_event_ids : []) as number[];
  const filesInvolved = (Array.isArray(detail.files_involved) ? detail.files_involved : []) as string[];

  return (
    <details className="mt-4 rounded border bg-gray-100 p-3 text-gray-1000">
      <summary className="text-[12px] font-medium cursor-pointer text-gray-1000">
        {attempts.length} failed attempt{attempts.length !== 1 ? "s" : ""}
        {resolution ? " \u2192 resolved" : " \u2192 unresolved"}
        {repeatedLater ? " \u00b7 repeated later" : ""}
      </summary>
      <div className="mt-3 space-y-3">
        {attempts.map((attempt, i) => (
          <div key={attempt.event_id ?? i} className="border-l-2 border-red-400 pl-2 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-gray-700">#{attempt.event_id}</span>
              <span className="text-[11px] font-mono text-red-700">{attempt.tool}</span>
            </div>
            <p className="text-[11px] font-mono text-gray-1000 break-words">{attempt.input}</p>
            <p className="text-[11px] text-red-700 break-words">{attempt.error}</p>
          </div>
        ))}

        {resolution && (
          <div className="border-l-2 border-green-400 pl-2 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-gray-700">#{resolution.event_id}</span>
              <span className="text-[11px] font-medium text-green-700">resolved</span>
            </div>
            <p className="text-[11px] font-mono text-gray-1000 break-words">{resolution.input}</p>
          </div>
        )}

        {filesInvolved.length > 0 && (
          <p className="text-[11px] text-gray-900 font-mono">
            files: {filesInvolved.join(", ")}
          </p>
        )}

        {repeatEventIds.length > 0 && (
          <p className="text-[11px] text-amber-700">
            Same mistake repeated at: {repeatEventIds.map((id) => `#${id}`).join(", ")}
          </p>
        )}

        {evidenceEventIds.length > 0 && (
          <p className="text-[11px] text-gray-900 font-mono">
            events: {evidenceEventIds.map((id) => `#${id}`).join(", ")}
          </p>
        )}
      </div>
    </details>
  );
}

function AutonomousDetail({
  detail,
  evidenceEventIds,
}: {
  detail: Record<string, unknown>;
  evidenceEventIds: number[];
}) {
  const wasCorrected = detail.was_corrected_by_user as boolean | undefined;
  const correctionEventId = detail.correction_event_id as number | null | undefined;
  const correctionText = detail.user_correction_text as string | null | undefined;

  return (
    <div className="mt-3 space-y-2">
      {wasCorrected && (
        <div className="border-l-2 border-amber-400 pl-2">
          <p className="text-[11px] text-amber-700">
            Corrected by user{correctionEventId ? ` at #${correctionEventId}` : ""}
          </p>
          {correctionText && (
            <p className="text-[11px] text-gray-1000 italic break-words">&ldquo;{correctionText}&rdquo;</p>
          )}
        </div>
      )}
      {evidenceEventIds.length > 0 && (
        <p className="text-[11px] text-gray-900 font-mono">
          events: {evidenceEventIds.map((id) => `#${id}`).join(", ")}
        </p>
      )}
    </div>
  );
}

function LegacyDetail({
  detail,
  evidenceEventIds,
}: {
  detail: string | Record<string, unknown>;
  evidenceEventIds: number[];
}) {
  return (
    <details className="mt-4 rounded border bg-gray-100 p-3 text-gray-1000">
      <summary className="text-[12px] font-medium cursor-pointer text-gray-1000">
        Detail
      </summary>
      <div className="mt-3 space-y-2">
        {typeof detail === "string" ? (
          <p className="text-[12px] text-gray-1000">{detail}</p>
        ) : (
          <dl className="space-y-1 text-[12px] text-gray-1000">
            {Object.entries(detail).map(([key, value]) => {
              if (value === null || value === undefined || value === "") return null;
              return (
                <div
                  key={key}
                  className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)] gap-2 items-start"
                >
                  <dt className="font-mono text-gray-900 break-words leading-snug">
                    {key}
                  </dt>
                  <dd className="break-words text-gray-1000">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        {evidenceEventIds.length > 0 && (
          <p className="text-[11px] text-gray-900 font-mono">
            events: {evidenceEventIds.map((id) => `#${id}`).join(", ")}
          </p>
        )}
      </div>
    </details>
  );
}

function normalizeWhatFailed(
  value: string | Record<string, unknown> | null
): string | Record<string, unknown> | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through to raw string output
    }

    return value;
  }

  return value;
}
