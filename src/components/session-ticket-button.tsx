"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function SessionTicketButton({
  sessionId,
  currentTicketId,
  fallbackCustomer,
}: {
  sessionId: string;
  currentTicketId: string | null;
  fallbackCustomer: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState(currentTicketId ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function save() {
    await fetch(`/api/sessions/${sessionId}/tag`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticketId || null,
        customer: fallbackCustomer || null,
      }),
    });

    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Set work item
      </Button>

      <Dialog open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set work item</DialogTitle>
            <DialogDescription>
              Add a work item id for this session.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={ticketId}
            onChange={(event) => setTicketId(event.target.value)}
            placeholder="DSE-1234 or custom-id"
            className="w-full font-mono"
          />

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
