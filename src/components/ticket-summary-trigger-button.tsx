"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function TicketSummaryTriggerButton({
  ticketId,
  hasSummary,
  needsRefresh = false,
  compact = false,
}: {
  ticketId: string;
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
      const response = await fetch(`/api/tickets/${ticketId}/summarize`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Failed to summarize ticket (${response.status})`);
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
          : "Summarizing Ticket..."
        : needsRefresh
          ? compact
            ? "Refresh Summary"
            : "Refresh Ticket Summary"
          : hasSummary
          ? compact
            ? "Regenerate Summary"
            : "Regenerate Ticket Summary"
          : compact
            ? "Generate Summary"
            : "Generate Ticket Summary"}
    </Button>
  );
}
