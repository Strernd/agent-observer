"use client";

import { EventBadge, SourceBadge, ToolBadge } from "./badge";
import { JsonViewer } from "./json-viewer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  isAssistantMessageEventType,
  isSessionEndEventType,
  isSessionIdleEventType,
  isSessionStartEventType,
  isSubagentStartEventType,
  isSubagentStopEventType,
  isToolErrorEventType,
  isToolPostEventType,
  isToolPreEventType,
  isUserPromptEventType,
} from "@/lib/hooks/events";
import { ChevronDown } from "lucide-react";

interface EventRowProps {
  eventType: string;
  source: string | null;
  model: string | null;
  toolName: string | null;
  toolInput: string | null;
  toolResponse: string | null;
  prompt: string | null;
  response: string | null;
  payload: string;
  relativeTime: string;
}

function summarizeEvent(props: EventRowProps): string {
  if (isUserPromptEventType(props.eventType)) {
    return props.prompt?.slice(0, 120) ?? "";
  }

  if (isToolPreEventType(props.eventType) || isToolPostEventType(props.eventType)) {
    if ((props.toolName === "Bash" || props.toolName === "bash") && props.toolInput) {
      try {
        const input = JSON.parse(props.toolInput);
        return input.command?.slice(0, 100) ?? "";
      } catch {
        return props.toolInput.slice(0, 100);
      }
    }

    if (props.toolInput) {
      try {
        const input = JSON.parse(props.toolInput);
        if (input.file_path) return input.file_path;
        if (input.filePath) return input.filePath;
        if (input.pattern) return input.pattern;
        if (input.query) return input.query?.slice(0, 80);
        if (input.command) return input.command.slice(0, 100);
      } catch {
        /* ignore */
      }
    }

    return "";
  }

  if (isToolErrorEventType(props.eventType)) {
    if (props.toolResponse) {
      try {
        const parsed = JSON.parse(props.toolResponse);
        if (parsed && typeof parsed === "object" && "error" in parsed) {
          const value = String(
            (parsed as { error?: unknown }).error ?? "Failed"
          );
          return value.split("\n")[0].slice(0, 120);
        }
        if (parsed && typeof parsed === "object" && "stderr" in parsed) {
          const value = String(
            (parsed as { stderr?: unknown }).stderr ?? "Failed"
          );
          return value.split("\n")[0].slice(0, 120);
        }
      } catch {
        return props.toolResponse.split("\n")[0].slice(0, 120);
      }
    }
    return "Failed";
  }

  if (isAssistantMessageEventType(props.eventType)) {
    return props.response?.slice(0, 120) ?? "";
  }

  if (isSessionStartEventType(props.eventType)) {
    return "Session started";
  }

  if (isSessionEndEventType(props.eventType)) {
    return "Session ended";
  }

  if (isSessionIdleEventType(props.eventType)) {
    return "Session idle";
  }

  if (isSubagentStartEventType(props.eventType)) {
    return "Subagent spawned";
  }

  if (isSubagentStopEventType(props.eventType)) {
    return "Subagent finished";
  }

  return "";
}

export function EventRow(props: EventRowProps) {
  const summary = summarizeEvent(props);

  return (
    <Collapsible>
      <div className="border-b border-gray-300 last:border-b-0">
        <CollapsibleTrigger className="w-full text-left px-4 py-2.5 hover:bg-gray-100 transition-colors flex items-center gap-3">
          <span className="text-[11px] font-mono text-gray-700 w-16 shrink-0">
            {props.relativeTime}
          </span>
          <EventBadge type={props.eventType} />
          <SourceBadge source={props.source} />
          {props.model && (
            <span className="text-[11px] font-mono text-gray-700 shrink-0">
              {props.model}
            </span>
          )}
          {props.toolName && <ToolBadge name={props.toolName} />}
          <span className="text-[13px] text-gray-900 truncate flex-1">
            {summary}
          </span>
          <ChevronDown className="size-3.5 text-gray-600 transition-transform [[data-panel-open]_&]:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-3 space-y-2 bg-gray-100">
            {props.prompt && (
              <div>
                <p className="text-[11px] font-medium text-gray-700 mb-1">
                  Prompt
                </p>
                <p className="text-[13px] text-gray-1000 whitespace-pre-wrap">
                  {props.prompt}
                </p>
              </div>
            )}
            {(props.source || props.model) && (
              <div>
                <p className="text-[11px] font-medium text-gray-700 mb-1">
                  Agent
                </p>
                <div className="flex items-center gap-2">
                  <SourceBadge source={props.source} />
                  {props.model && (
                    <span className="text-[12px] font-mono text-gray-900">
                      {props.model}
                    </span>
                  )}
                </div>
              </div>
            )}
            {props.toolInput && (
              <div>
                <p className="text-[11px] font-medium text-gray-700 mb-1">
                  Input
                </p>
                <JsonViewer data={props.toolInput} />
              </div>
            )}
            {props.toolResponse && (
              <div>
                <p className="text-[11px] font-medium text-gray-700 mb-1">
                  Output
                </p>
                <JsonViewer data={props.toolResponse} />
              </div>
            )}
            {props.response && (
              <div>
                <p className="text-[11px] font-medium text-gray-700 mb-1">
                  Response
                </p>
                <p className="text-[13px] text-gray-1000 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {props.response}
                </p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-medium text-gray-700 mb-1">
                Full Payload
              </p>
              <JsonViewer data={props.payload} />
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
