"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

export function LastDayOverview({
  header,
  actions,
  children,
}: {
  header: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="mb-6 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-5">
          <CollapsibleTrigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className={`shrink-0 text-gray-600 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            >
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="min-w-0 flex-1">{header}</div>
          </CollapsibleTrigger>
          <div className="shrink-0">{actions}</div>
        </div>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
