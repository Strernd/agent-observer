import type { AdaptedHookEvent } from "@/lib/hooks/types";
import { adaptClaudePayload } from "./claude";
import { adaptCodexPayload } from "./codex";
import { adaptOpenCodePayload } from "./opencode";

export function adaptHookPayload(
  rawPayload: Record<string, unknown>
): AdaptedHookEvent | null {
  switch (rawPayload.observer_source) {
    case "codex":
      return adaptCodexPayload(rawPayload);
    case "opencode":
      return adaptOpenCodePayload(rawPayload);
    default:
      return adaptClaudePayload(rawPayload);
  }
}
