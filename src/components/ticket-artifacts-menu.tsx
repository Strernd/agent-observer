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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TicketArtifactMenuItem = {
  path: string;
  sessionId: string;
};

export function TicketArtifactsMenu({
  artifacts,
  className,
}: {
  artifacts: TicketArtifactMenuItem[];
  className?: string;
}) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  if (artifacts.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-1.5",
          className
        )}
      >
        <FileText className="size-3.5" />
        {artifacts.length} Artifact{artifacts.length !== 1 ? "s" : ""}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64">
        {artifacts.map((artifact) => {
          const fileName = artifact.path.split("/").pop() ?? artifact.path;
          const openUrl = `/api/sessions/${artifact.sessionId}/artifacts?path=${encodeURIComponent(
            artifact.path
          )}`;
          const downloadUrl = `${openUrl}&disposition=attachment`;
          const copied = copiedPath === artifact.path;

          return (
            <DropdownMenuSub key={`${artifact.sessionId}:${artifact.path}`}>
              <DropdownMenuSubTrigger className="max-w-[20rem]">
                <FileText className="size-4 text-gray-700" />
                <span className="truncate">{fileName}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-44">
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
                    void navigator.clipboard.writeText(artifact.path);
                    setCopiedPath(artifact.path);
                    window.setTimeout(() => {
                      setCopiedPath((current) =>
                        current === artifact.path ? null : current
                      );
                    }, 1200);
                  }}
                >
                  {copied ? (
                    <Check className="size-4 text-gray-700" />
                  ) : (
                    <Copy className="size-4 text-gray-700" />
                  )}
                  {copied ? "Copied path" : "Copy path"}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
