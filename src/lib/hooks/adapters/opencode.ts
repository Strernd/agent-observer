import type { AdaptedHookEvent } from "@/lib/hooks/types";
import { pickString, withSourcePrefix } from "./utils";

function mapOpenCodeEventType(
  sourceEventType: string
): AdaptedHookEvent["eventType"] {
  switch (sourceEventType) {
    case "session.created":
      return "session_start";
    case "session.deleted":
      return "session_end";
    case "session.idle":
      return "session_idle";
    case "message.user":
      return "user_prompt";
    case "message.assistant":
      return "assistant_message";
    case "tool.execute.before":
      return "tool_pre";
    case "tool.execute.after":
      return "tool_post";
    case "tool.execute.error":
      return "tool_error";
    default:
      return "session_activity";
  }
}

export function adaptOpenCodePayload(
  rawPayload: Record<string, unknown>
): AdaptedHookEvent | null {
  const sessionId = pickString(rawPayload.session_id);
  const sourceEventType = pickString(rawPayload.opencode_event_type);

  if (!sessionId || !sourceEventType) {
    return null;
  }

  return {
    source: "opencode",
    sessionId,
    sourceEventType,
    sourceDescriptor: withSourcePrefix("opencode", sourceEventType),
    eventType: mapOpenCodeEventType(sourceEventType),
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
