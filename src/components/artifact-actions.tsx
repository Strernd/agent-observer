"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function ArtifactActions({
  artifactPath,
  sessionId,
  className,
}: {
  artifactPath: string;
  sessionId: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const fileName = artifactPath.split("/").pop() ?? artifactPath;
  const openUrl = `/api/sessions/${sessionId}/artifacts?path=${encodeURIComponent(
    artifactPath
  )}`;
  const downloadUrl = `${openUrl}&disposition=attachment`;

  async function copyPath() {
    await navigator.clipboard.writeText(artifactPath);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1200);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "w-full justify-start gap-2 px-2 text-left text-[12px] font-normal text-gray-1000 hover:bg-muted",
          className
        )}
      >
        <FileText className="size-3.5 text-gray-600" />
        <span className="min-w-0 flex-1 truncate">{fileName}</span>
        <ChevronDown className="size-3.5 text-gray-600" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-48">
        <DropdownMenuItem
          onClick={() => {
            window.open(openUrl, "_blank", "noopener,noreferrer");
          }}
        >
          <ExternalLink className="size-4 text-gray-700" />
          Open in new tab
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            window.open(downloadUrl, "_blank", "noopener,noreferrer");
          }}
        >
          <Download className="size-4 text-gray-700" />
          Download
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void copyPath();
          }}
        >
          {copied ? (
            <Check className="size-4 text-gray-700" />
          ) : (
            <Copy className="size-4 text-gray-700" />
          )}
          {copied ? "Copied path" : "Copy path"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
