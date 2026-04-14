"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ReportStatus = "idle" | "running" | "succeeded" | "failed";

export function DailyReportTrigger({
  reportDate,
  initialStatus,
  needsProcessing,
  summaryTargetCount,
  decisionTargetCount,
  runningDecisionCount = 0,
}: {
  reportDate: string;
  initialStatus: ReportStatus;
  needsProcessing: boolean;
  summaryTargetCount: number;
  decisionTargetCount: number;
  runningDecisionCount?: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ReportStatus>(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (status !== "running") {
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/reports/daily/${reportDate}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load report status (${response.status})`);
        }

        const payload = (await response.json()) as {
          report?: { status?: ReportStatus; errorMessage?: string | null } | null;
        };
        const nextStatus = payload.report?.status ?? "idle";

        if (cancelled) {
          return;
        }

        setStatus(nextStatus);

        if (nextStatus === "failed") {
          setMessage(payload.report?.errorMessage ?? "Daily report processing failed.");
        }

        if (nextStatus === "succeeded") {
          setMessage("Daily report finished.");
        }

        if (nextStatus !== "running") {
          startTransition(() => {
            router.refresh();
          });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("failed");
          setMessage(toErrorMessage(error));
        }
      }
    }

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [reportDate, router, startTransition, status]);

  async function onClick() {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/reports/daily/${reportDate}`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `Failed to start report (${response.status})`);
      }

      setStatus("running");
      setMessage(buildQueuedMessage(summaryTargetCount, decisionTargetCount, runningDecisionCount));
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setStatus("failed");
      setMessage(toErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting || isPending || status === "running";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {message && (
        <span className="text-[12px] tabular-nums text-gray-700">{message}</span>
      )}
      <Button
        size="sm"
        variant={needsProcessing || status === "failed" ? "default" : "outline"}
        aria-busy={disabled}
        disabled={disabled}
        onClick={() => {
          void onClick();
        }}
      >
        {status === "running" ? (
          <>
            <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Processing&hellip;
          </>
        ) : needsProcessing ? (
          "Process AI Day Report"
        ) : (
          "Re-run AI Day Report"
        )}
      </Button>
    </div>
  );
}

function buildQueuedMessage(
  summaryTargetCount: number,
  decisionTargetCount: number,
  runningDecisionCount: number
) {
  const parts: string[] = [];

  if (summaryTargetCount > 0) {
    parts.push(`${summaryTargetCount} summaries`);
  }

  if (decisionTargetCount > 0) {
    parts.push(`${decisionTargetCount} decision runs`);
  }

  if (runningDecisionCount > 0) {
    parts.push(`${runningDecisionCount} already running`);
  }

  if (parts.length === 0) {
    return "Queued a fresh day report run.";
  }

  return `Queued ${parts.join(", ")} for this day.`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected error";
}
