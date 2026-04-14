"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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

export function SessionNameEditor({
  sessionId,
  currentName,
}: {
  sessionId: string;
  currentName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentName ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function save() {
    await fetch(`/api/sessions/${sessionId}/tag`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionName: value || null,
      }),
    });

    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setOpen(true)}
        aria-label="Edit session name"
        title="Edit session name"
      >
        <Pencil />
      </Button>

      <Dialog open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit session name</DialogTitle>
            <DialogDescription>
              This overrides the extracted session name for this session.
            </DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Session name"
            className="w-full"
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
