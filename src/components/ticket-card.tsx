import Link from "next/link";
import { Card } from "@/components/ui/card";
import { TicketSummaryTriggerButton } from "./ticket-summary-trigger-button";
import {
  TicketArtifactsMenu,
  type TicketArtifactMenuItem,
} from "./ticket-artifacts-menu";

interface TicketCardProps {
  id: string;
  customer: string;
  title: string | null;
  currentState: string | null;
  progress: string | null;
  artifacts?: TicketArtifactMenuItem[];
  summaryNeedsRefresh?: boolean;
  sessionCount: number;
  latestActivity: Date | string | number | null;
}

export function TicketCard({
  id,
  customer,
  title,
  currentState,
  progress,
  artifacts = [],
  summaryNeedsRefresh = false,
  sessionCount,
  latestActivity,
}: TicketCardProps) {
  const latestActivityDate = normalizeDate(latestActivity);
  const hasSummary = Boolean(currentState);
  const progressItems = parseJsonArray(progress).slice(0, 5);

  return (
    <Card className="p-5 transition-colors hover:border-gray-500 md:p-6">
      <Link href={`/tickets/${id}`} className="block">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-mono font-medium text-blue-700">
              {id}
            </span>
            <span className="text-[13px] text-gray-1000">{customer}</span>
          </div>
          <span className="text-[12px] text-gray-700">
            {sessionCount} session{sessionCount !== 1 ? "s" : ""}
          </span>
        </div>
        {title && (
          <p className="mb-2 text-[13px] text-gray-900">{title}</p>
        )}
        {progressItems.length > 0 ? (
          <div className="mb-3 space-y-1.5">
            {progressItems.map((item, index) => (
              <div
                key={`${id}-progress-${index}`}
                className="flex items-start gap-2 text-[12px] text-gray-700"
              >
                <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-gray-400" />
                <span className="line-clamp-1">{item}</span>
              </div>
            ))}
          </div>
        ) : currentState ? (
          <p className="mb-2 line-clamp-2 text-[12px] text-gray-700">
            {currentState}
          </p>
        ) : null}
        {latestActivityDate && (
          <p className="text-[12px] text-gray-700">
            Last active:{" "}
            {latestActivityDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </p>
        )}
      </Link>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
        <TicketArtifactsMenu artifacts={artifacts} />
        <TicketSummaryTriggerButton
          ticketId={id}
          hasSummary={hasSummary}
          needsRefresh={summaryNeedsRefresh}
          compact
        />
      </div>
    </Card>
  );
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeDate(value: Date | string | number | null): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    if (value.getTime() > 0 && value.getTime() < 1_000_000_000_000) {
      const corrected = new Date(value.getTime() * 1_000);
      return Number.isNaN(corrected.getTime()) ? null : corrected;
    }

    return value;
  }

  if (typeof value === "number") {
    const ms = value < 1_000_000_000_000 ? value * 1_000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const ms = parsed < 1_000_000_000_000 ? parsed * 1_000 : parsed;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
