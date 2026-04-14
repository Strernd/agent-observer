export type ObserverSource = "claude" | "codex" | "opencode";

export type CanonicalEventType =
  | "session_start"
  | "session_end"
  | "session_idle"
  | "session_activity"
  | "user_prompt"
  | "assistant_message"
  | "tool_pre"
  | "tool_post"
  | "tool_error"
  | "subagent_start"
  | "subagent_stop";

export type AdaptedHookEvent = {
  source: ObserverSource;
  sessionId: string;
  sourceEventType: string;
  sourceDescriptor: string;
  eventType: CanonicalEventType;
  cwd: string | null;
  model: string | null;
  toolName: string | null;
  toolInput: unknown;
  toolResponse: unknown;
  prompt: string | null;
  response: string | null;
  rawPayload: Record<string, unknown>;
};
