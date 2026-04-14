"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function JsonViewer({ data }: { data: string }) {
  const [expanded, setExpanded] = useState(false);

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return (
      <pre className="text-[12px] font-mono text-gray-900 whitespace-pre-wrap break-all">
        {data}
      </pre>
    );
  }

  if (!expanded) {
    const preview =
      typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed).slice(0, 120)
        : String(parsed);
    return (
      <div className="flex items-start gap-2">
        <pre className="text-[12px] font-mono text-gray-900 truncate flex-1">
          {preview}
          {preview.length >= 120 ? "\u2026" : ""}
        </pre>
        <Button
          variant="link"
          size="xs"
          onClick={() => setExpanded(true)}
          className="text-[11px] text-blue-700 shrink-0 h-auto p-0"
        >
          expand
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-1">
        <Button
          variant="link"
          size="xs"
          onClick={() => setExpanded(false)}
          className="text-[11px] text-blue-700 h-auto p-0"
        >
          collapse
        </Button>
      </div>
      <pre className="text-[12px] font-mono text-gray-900 whitespace-pre-wrap break-all overflow-x-auto max-h-96 overflow-y-auto">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    </div>
  );
}
