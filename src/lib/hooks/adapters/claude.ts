import type { AdaptedHookEvent } from "@/lib/hooks/types";
import { pickString, withSourcePrefix } from "./utils";

function mapClaudeEventType(eventType: string): AdaptedHookEvent["eventType"] {
  switch (eventType) {
    case "SessionStart":
      return "session_start";
    case "SessionEnd":
      return "session_end";
    case "UserPromptSubmit":
      return "user_prompt";
    case "PreToolUse":
      return "tool_pre";
    case "PostToolUse":
      return "tool_post";
    case "PostToolUseFailure":
      return "tool_error";
    case "Stop":
      return "assistant_message";
    case "SubagentStart":
      return "subagent_start";
    case "SubagentStop":
      return "subagent_stop";
    default:
      return "session_activity";
  }
}

export function adaptClaudePayload(
  rawPayload: Record<string, unknown>
): AdaptedHookEvent | null {
  const sessionId = pickString(rawPayload.session_id);
  const sourceEventType = pickString(rawPayload.hook_event_name);

  if (!sessionId || !sourceEventType) {
    return null;
  }

  return {
    source: "claude",
    sessionId,
    sourceEventType,
    sourceDescriptor: withSourcePrefix("claude", rawPayload.source),
    eventType: mapClaudeEventType(sourceEventType),
    cwd: pickString(rawPayload.cwd),
    model: pickString(rawPayload.model),
    toolName: pickString(rawPayload.tool_name),
    toolInput: rawPayload.tool_input ?? null,
    toolResponse:
      rawPayload.tool_response ??
      (rawPayload.error !== undefined ? { error: rawPayload.error } : null),
    prompt: pickString(rawPayload.prompt),
    response: pickString(rawPayload.last_assistant_message),
    rawPayload,
  };
}
