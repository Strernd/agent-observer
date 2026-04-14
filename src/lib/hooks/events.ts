const SESSION_START = new Set(["session_start", "SessionStart"]);
const SESSION_END = new Set(["session_end", "SessionEnd"]);
const SESSION_IDLE = new Set(["session_idle"]);
const USER_PROMPT = new Set(["user_prompt", "UserPromptSubmit"]);
const ASSISTANT_MESSAGE = new Set(["assistant_message", "Stop"]);
const TOOL_PRE = new Set(["tool_pre", "PreToolUse"]);
const TOOL_POST = new Set(["tool_post", "PostToolUse"]);
const TOOL_ERROR = new Set(["tool_error", "PostToolUseFailure"]);
const SUBAGENT_START = new Set(["subagent_start", "SubagentStart"]);
const SUBAGENT_STOP = new Set(["subagent_stop", "SubagentStop"]);

export function isSessionStartEventType(eventType: string): boolean {
  return SESSION_START.has(eventType);
}

export function isSessionEndEventType(eventType: string): boolean {
  return SESSION_END.has(eventType);
}

export function isSessionIdleEventType(eventType: string): boolean {
  return SESSION_IDLE.has(eventType);
}

export function isUserPromptEventType(eventType: string): boolean {
  return USER_PROMPT.has(eventType);
}

export function isAssistantMessageEventType(eventType: string): boolean {
  return ASSISTANT_MESSAGE.has(eventType);
}

export function isToolPreEventType(eventType: string): boolean {
  return TOOL_PRE.has(eventType);
}

export function isToolPostEventType(eventType: string): boolean {
  return TOOL_POST.has(eventType);
}

export function isToolErrorEventType(eventType: string): boolean {
  return TOOL_ERROR.has(eventType);
}

export function isSubagentStartEventType(eventType: string): boolean {
  return SUBAGENT_START.has(eventType);
}

export function isSubagentStopEventType(eventType: string): boolean {
  return SUBAGENT_STOP.has(eventType);
}

export function shouldSummarizeAfterEventType(eventType: string): boolean {
  return (
    isSessionEndEventType(eventType) || isSessionIdleEventType(eventType)
  );
}

export function formatEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "session_start":
      return "SessionStart";
    case "session_end":
      return "SessionEnd";
    case "session_idle":
      return "SessionIdle";
    case "session_activity":
      return "SessionActivity";
    case "user_prompt":
      return "UserPrompt";
    case "assistant_message":
      return "AssistantMessage";
    case "tool_pre":
      return "ToolPre";
    case "tool_post":
      return "ToolPost";
    case "tool_error":
      return "ToolError";
    case "subagent_start":
      return "SubagentStart";
    case "subagent_stop":
      return "SubagentStop";
    default:
      return eventType;
  }
}
