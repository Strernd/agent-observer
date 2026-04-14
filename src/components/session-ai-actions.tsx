"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type DecisionRun = {
  id: number;
  status: "running" | "succeeded" | "failed";
  errorMessage: string | null;
};

type LatestRunResponse = {
  run: DecisionRun | null;
};

export function SessionAiActions({
  sessionId,
  hasSummary,
  summaryNeedsRefresh,
  hasDecisions,
  decisionsNeedRefresh,
  isDecisionRunning,
}: {
  sessionId: string;
  hasSummary: boolean;
  summaryNeedsRefresh: boolean;
  hasDecisions: boolean;
  decisionsNeedRefresh: boolean;
  isDecisionRunning: boolean;
}) {
  const router = useRouter();
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isDecisionLoading, setIsDecisionLoading] = useState(false);
  const [isDecisionQueued, setIsDecisionQueued] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (hasDecisions || isDecisionRunning) {
      setIsDecisionQueued(false);
      setDecisionError(null);
    }
  }, [hasDecisions, isDecisionRunning]);

  useEffect(() => {
    if (!isDecisionQueued && !isDecisionRunning) return;

    let cancelled = false;

    async function checkLatestRun() {
      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/decisions/runs/latest`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to load decision status (${response.status})`);
        }

        const payload = (await response.json()) as LatestRunResponse;
        const status = payload.run?.status ?? null;

        if (cancelled || status === "running") {
          return;
        }

        setIsDecisionQueued(false);
        setDecisionError(
          status === "failed"
            ? payload.run?.errorMessage ?? "Decision extraction failed"
            : null
        );

        startTransition(() => {
          router.refresh();
        });
      } catch (error) {
        if (!cancelled) {
          setIsDecisionQueued(false);
          setDecisionError(toErrorMessage(error));
        }
      }
    }

    void checkLatestRun();

    const interval = window.setInterval(() => {
      void checkLatestRun();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isDecisionQueued, isDecisionRunning, router, sessionId, startTransition]);

  async function triggerSummary() {
    setIsSummaryLoading(true);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/summarize`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Failed to summarize session (${response.status})`);
      }

      startTransition(() => {
        router.refresh();
      });
    } finally {
      setIsSummaryLoading(false);
    }
  }

  async function triggerDecisions() {
    setIsDecisionLoading(true);
    setDecisionError(null);

    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/decisions/extract`,
        {
          method: "POST",
        }
      );

      const payload = (await response.json()) as {
        run?: DecisionRun;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? `Failed to extract session decisions (${response.status})`
        );
      }

      setIsDecisionQueued(payload.run?.status === "running");

      startTransition(() => {
        router.refresh();
      });
    } finally {
      setIsDecisionLoading(false);
    }
  }

  const disabled = isPending || isSummaryLoading || isDecisionLoading;
  const showSummaryAction = !hasSummary || summaryNeedsRefresh;
  const showDecisionAction = !hasDecisions || decisionsNeedRefresh || isDecisionRunning;
  const decisionIsBusy = isDecisionLoading || isPending || isDecisionRunning || isDecisionQueued;

  if (!showSummaryAction && !showDecisionAction) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSummaryAction && (
        <Button
          variant={summaryNeedsRefresh ? "outline" : !hasSummary ? "default" : "outline"}
          size="sm"
          aria-busy={isSummaryLoading || isPending}
          onClick={() => {
            void triggerSummary();
          }}
          disabled={disabled}
        >
          {isSummaryLoading
            ? "Summarizing..."
            : summaryNeedsRefresh
              ? "Refresh Summary"
              : "Generate Summary"}
        </Button>
      )}
      {showDecisionAction && (
        <Button
          variant={decisionsNeedRefresh ? "outline" : !hasDecisions ? "default" : "outline"}
          size="sm"
          aria-busy={decisionIsBusy}
          onClick={() => {
            void triggerDecisions();
          }}
          disabled={disabled || isDecisionRunning || isDecisionQueued}
        >
          {isDecisionLoading
            ? "Queuing..."
            : isDecisionRunning || isDecisionQueued
              ? "Running Decisions..."
              : decisionsNeedRefresh
                ? "Refresh Decisions"
                : "Generate Decisions"}
        </Button>
      )}
      {decisionError && (
        <span className="text-[12px] text-red-700">{decisionError}</span>
      )}
    </div>
  );
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected error";
}
