import type { AdaptedHookEvent } from "@/lib/hooks/types";
import {
  parseMaybeJsonObject,
  pickString,
  withSourcePrefix,
} from "./utils";

function codexPostToolLooksLikeFailure(toolResponse: unknown): boolean {
  const response = parseMaybeJsonObject(toolResponse);
  if (!response) return false;

  const numericStatus = [
    response.exitCode,
    response.exit_code,
    response.statusCode,
    response.status,
  ];

  for (const value of numericStatus) {
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
      return true;
    }
    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value)) &&
      Number(value) !== 0
    ) {
      return true;
    }
  }

  if (response.success === false) {
    return true;
  }

  return (
    pickString(response.error) !== null ||
    pickString(response.message) !== null ||
    pickString(response.stderr) !== null
  );
}

function mapCodexEventType(
  sourceEventType: string,
  toolResponse: unknown
): AdaptedHookEvent["eventType"] {
  switch (sourceEventType) {
    case "SessionStart":
      return "session_start";
    case "UserPromptSubmit":
      return "user_prompt";
    case "PreToolUse":
      return "tool_pre";
    case "PostToolUse":
      return codexPostToolLooksLikeFailure(toolResponse)
        ? "tool_error"
        : "tool_post";
    case "Stop":
      return "assistant_message";
    default:
      return "session_activity";
  }
}

export function adaptCodexPayload(
  rawPayload: Record<string, unknown>
): AdaptedHookEvent | null {
  const sessionId = pickString(rawPayload.session_id);
  const sourceEventType = pickString(rawPayload.hook_event_name);

  if (!sessionId || !sourceEventType) {
    return null;
  }

  const toolResponse = rawPayload.tool_response ?? null;

  return {
    source: "codex",
    sessionId,
    sourceEventType,
    sourceDescriptor: withSourcePrefix("codex", rawPayload.source),
    eventType: mapCodexEventType(sourceEventType, toolResponse),
    cwd: pickString(rawPayload.cwd),
    model: pickString(rawPayload.model),
    toolName: pickString(rawPayload.tool_name),
    toolInput: rawPayload.tool_input ?? null,
    toolResponse,
    prompt: pickString(rawPayload.prompt),
    response: pickString(rawPayload.last_assistant_message),
    rawPayload,
  };
}
