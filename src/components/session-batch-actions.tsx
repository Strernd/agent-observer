"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SessionBatchActions({
  summarySessionIds,
  decisionSessionIds,
  highlightSummaryRefresh = false,
  highlightDecisionRefresh = false,
}: {
  summarySessionIds: string[];
  decisionSessionIds: string[];
  highlightSummaryRefresh?: boolean;
  highlightDecisionRefresh?: boolean;
}) {
  const router = useRouter();
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isDecisionLoading, setIsDecisionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function queueSummaries() {
    setIsSummaryLoading(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/sessions/summaries/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ sessionIds: summarySessionIds }),
      });
      const payload = (await response.json()) as {
        queued?: number;
        skipped?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }

      setStatusMessage(
        `Queued ${payload.queued ?? 0} summaries` +
          ((payload.skipped ?? 0) > 0 ? `, skipped ${payload.skipped}` : "") +
          "."
      );
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setStatusMessage(toErrorMessage(error));
    } finally {
      setIsSummaryLoading(false);
    }
  }

  async function queueDecisions() {
    setIsDecisionLoading(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/sessions/decisions/batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ sessionIds: decisionSessionIds }),
      });
      const payload = (await response.json()) as {
        queued?: number;
        skipped?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }

      setStatusMessage(
        `Queued ${payload.queued ?? 0} decision runs` +
          ((payload.skipped ?? 0) > 0 ? `, skipped ${payload.skipped}` : "") +
          "."
      );
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setStatusMessage(toErrorMessage(error));
    } finally {
      setIsDecisionLoading(false);
    }
  }

  const hasSummaryTargets = summarySessionIds.length > 0;
  const hasDecisionTargets = decisionSessionIds.length > 0;
  const disabled = isPending;

  if (!hasSummaryTargets && !hasDecisionTargets) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {hasSummaryTargets && (
        <Button
          variant="outline"
          size="sm"
          aria-busy={isSummaryLoading || isPending}
          onClick={() => {
            void queueSummaries();
          }}
          disabled={disabled || isSummaryLoading || isDecisionLoading}
        >
          {isSummaryLoading
            ? "Queuing summaries..."
            : highlightSummaryRefresh
              ? `Refresh Summaries (${summarySessionIds.length})`
              : `Run Summaries (${summarySessionIds.length})`}
        </Button>
      )}
      {hasDecisionTargets && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void queueDecisions();
          }}
          disabled={disabled || isSummaryLoading || isDecisionLoading}
        >
          {isDecisionLoading
            ? "Queuing decisions..."
            : highlightDecisionRefresh
              ? `Refresh Decisions (${decisionSessionIds.length})`
              : `Run Decisions (${decisionSessionIds.length})`}
        </Button>
      )}
      {statusMessage && (
        <span className="text-[12px] text-gray-700">{statusMessage}</span>
      )}
    </div>
  );
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected error";
}
