"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DecisionCard } from "@/components/decision-card";
import { formatDate, formatTime } from "@/lib/format";

type DecisionRun = {
  id: number;
  sessionId: string;
  status: "running" | "succeeded" | "failed";
  triggeredBy: string;
  startedAt: string;
  endedAt: string | null;
  errorMessage: string | null;
  model: string;
  promptVersion: string;
  decisionCount: number | null;
  lastProcessedEventId: number | null;
};

type DecisionApiRow = {
  id: number;
  sessionId: string;
  runId: number;
  ordinal: number;
  decision: string;
  whyPivotal: string;
  confidence: string;
  category: string;
  evidenceEventIds: string;
  whatFailed: string | null;
  createdAt: string;
};

type DecisionListResponse = {
  decisions: DecisionApiRow[];
};

type LatestRunResponse = {
  run: DecisionRun | null;
  latestSuccessfulRun: DecisionRun | null;
  latestEventId: number | null;
  needsRefresh: boolean;
};

type UiDecision = {
  id: number;
  decision: string;
  whyPivotal: string;
  confidence: string;
  category: string;
  whatFailed: string | null;
  evidenceEventIds: number[];
  createdAt: string;
};

export function DecisionsPanel({ sessionId, category }: { sessionId: string; category?: string }) {
  const [decisions, setDecisions] = useState<UiDecision[]>([]);
  const [latestRun, setLatestRun] = useState<DecisionRun | null>(null);
  const [latestSuccessfulRun, setLatestSuccessfulRun] = useState<DecisionRun | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const loadData = useCallback(async () => {
    const [decisionsRes, runsRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}/decisions?limit=500`, {
        cache: "no-store",
      }),
      fetch(`/api/sessions/${sessionId}/decisions/runs/latest`, {
        cache: "no-store",
      }),
    ]);

    if (!decisionsRes.ok) {
      throw new Error(`Failed to load decisions (${decisionsRes.status})`);
    }
    if (!runsRes.ok) {
      throw new Error(`Failed to load decision runs (${runsRes.status})`);
    }

    const decisionsJson = (await decisionsRes.json()) as DecisionListResponse;
    const runsJson = (await runsRes.json()) as LatestRunResponse;

    setDecisions(
      decisionsJson.decisions.map((row) => ({
        id: row.id,
        decision: row.decision,
        whyPivotal: row.whyPivotal,
        confidence: row.confidence,
        category: row.category,
        whatFailed: row.whatFailed,
        evidenceEventIds: parseEvidenceEventIds(row.evidenceEventIds),
        createdAt: row.createdAt,
      }))
    );
    setLatestRun(runsJson.run);
    setLatestSuccessfulRun(runsJson.latestSuccessfulRun);
    setNeedsRefresh(runsJson.needsRefresh);
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        await loadData();
      } catch (error) {
        if (!cancelled) {
          setLoadError(toErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const filtered = useMemo(
    () => category ? decisions.filter((d) => d.category === category) : decisions,
    [decisions, category]
  );

  const isRunning = latestRun?.status === "running";

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      void loadData().catch((error) => {
        setLoadError(toErrorMessage(error));
      });
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning, loadData]);

  async function triggerExtraction() {
    setIsTriggering(true);
    setLoadError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/decisions/extract`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        run?: DecisionRun;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
      }

      if (payload.run) {
        setLatestRun(payload.run);
      }

      await loadData();
    } catch (error) {
      setLoadError(toErrorMessage(error));
    } finally {
      setIsTriggering(false);
    }
  }

  const status = latestRun?.status ?? "idle";
  const statusClassName = useMemo(() => {
    if (status === "running") return "bg-blue-100 text-blue-700";
    if (status === "succeeded") return "bg-green-100 text-green-700";
    if (status === "failed") return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-900";
  }, [status]);

  const lastSuccessfulAt =
    latestSuccessfulRun?.endedAt ?? latestSuccessfulRun?.startedAt ?? null;

  return (
    <div className="flex flex-col gap-2">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-gray-700">Extraction status</span>
              <Badge variant="secondary" className={cn("rounded text-[11px]", statusClassName)}>
                {status}
              </Badge>
            </div>
            {lastSuccessfulAt && (
              <p className="text-[12px] text-gray-700">
                Last successful run: {formatDate(new Date(lastSuccessfulAt))}{" "}
                {formatTime(new Date(lastSuccessfulAt))}
              </p>
            )}
          </div>

          <Button
            variant={decisions.length === 0 ? "default" : "outline"}
            size="sm"
            onClick={triggerExtraction}
            disabled={isRunning || isTriggering}
          >
            {isRunning
              ? "Extraction running..."
              : needsRefresh
                ? "Refresh Decisions"
                : decisions.length === 0
                  ? "Extract Decisions"
                  : "Reprocess Decisions"}
          </Button>
        </div>

        {needsRefresh && !isRunning && (
          <p className="text-[12px] text-amber-700 mt-3">
            New events were recorded after the latest successful extraction.
          </p>
        )}

        {latestRun?.status === "failed" && (
          <p className="text-[12px] text-red-700 mt-3">
            Latest extraction failed: {latestRun.errorMessage ?? "unknown error"}. Retry using
            the button above.
          </p>
        )}

        {loadError && (
          <p className="text-[12px] text-red-700 mt-3">{loadError}</p>
        )}
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center">
          <p className="text-[14px] text-gray-900">Loading...</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-[14px] text-gray-900">
            {decisions.length === 0
              ? "No insights extracted yet"
              : `No ${category === "friction" ? "friction" : "decisions"} found`}
          </p>
          {decisions.length === 0 && (
            <p className="text-[13px] text-gray-700 mt-1">
              Run extraction to generate insights for this session.
            </p>
          )}
        </Card>
      ) : (
        filtered.map((decision) => (
          <DecisionCard
            key={decision.id}
            decision={decision.decision}
            whyPivotal={decision.whyPivotal}
            category={decision.category}
            whatFailed={decision.whatFailed}
            evidenceEventIds={decision.evidenceEventIds}
            timestamp={decision.createdAt}
          />
        ))
      )}
    </div>
  );
}

function parseEvidenceEventIds(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed
      .filter((value) => typeof value === "number" && Number.isFinite(value))
      .map((value) => Math.floor(value))
      .filter((value) => value > 0);

    return Array.from(new Set(normalized)).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected error";
}
