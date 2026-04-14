"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SummaryTriggerButton({
  sessionId,
  hasSummary,
  needsRefresh = false,
}: {
  sessionId: string;
  hasSummary: boolean;
  needsRefresh?: boolean;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function triggerSummary() {
    setIsLoading(true);

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
      setIsLoading(false);
    }
  }

  return (
    <Button
      variant={needsRefresh ? "outline" : hasSummary ? "outline" : "default"}
      size="sm"
      aria-busy={isLoading || isPending}
      onClick={() => {
        void triggerSummary();
      }}
      disabled={isLoading || isPending}
    >
      {isLoading || isPending
        ? "Summarizing..."
        : needsRefresh
          ? "Refresh Summary"
          : hasSummary
          ? "Regenerate Summary"
          : "Generate Summary"}
    </Button>
  );
}
