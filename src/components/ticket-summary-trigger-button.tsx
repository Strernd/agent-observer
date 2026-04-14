"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function TicketSummaryTriggerButton({
  workItemId,
  hasSummary,
  needsRefresh = false,
  compact = false,
}: {
  workItemId: string;
  hasSummary: boolean;
  needsRefresh?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function triggerSummary() {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(workItemId)}/summarize`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Failed to summarize work item (${response.status})`);
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
      variant="outline"
      size="sm"
      aria-busy={isLoading || isPending}
      onClick={() => {
        void triggerSummary();
      }}
      disabled={isLoading || isPending}
    >
      {isLoading || isPending
        ? compact
          ? "Summarizing..."
          : "Summarizing Work Item..."
        : needsRefresh
          ? compact
            ? "Refresh Summary"
            : "Refresh Work Item Summary"
          : hasSummary
          ? compact
            ? "Regenerate Summary"
            : "Regenerate Work Item Summary"
          : compact
            ? "Generate Summary"
            : "Generate Work Item Summary"}
    </Button>
  );
}
