import { Badge } from "@/components/ui/badge";
import { formatEventTypeLabel } from "@/lib/hooks/events";
import { cn } from "@/lib/utils";

const EVENT_COLORS: Record<string, string> = {
  SessionStart: "bg-green-100 text-green-700",
  SessionEnd: "bg-green-100 text-green-700",
  session_start: "bg-green-100 text-green-700",
  session_end: "bg-green-100 text-green-700",
  session_idle: "bg-green-100 text-green-700",
  UserPromptSubmit: "bg-blue-100 text-blue-700",
  user_prompt: "bg-blue-100 text-blue-700",
  PreToolUse: "bg-amber-100 text-amber-700",
  PostToolUse: "bg-amber-100 text-amber-700",
  PostToolUseFailure: "bg-red-100 text-red-700",
  tool_pre: "bg-amber-100 text-amber-700",
  tool_post: "bg-amber-100 text-amber-700",
  tool_error: "bg-red-100 text-red-700",
  Stop: "bg-violet-100 text-violet-700",
  assistant_message: "bg-violet-100 text-violet-700",
  SubagentStart: "bg-cyan-100 text-cyan-700",
  SubagentStop: "bg-cyan-100 text-cyan-700",
  subagent_start: "bg-cyan-100 text-cyan-700",
  subagent_stop: "bg-cyan-100 text-cyan-700",
  session_activity: "bg-gray-100 text-gray-900",
};

const CATEGORY_COLORS: Record<string, string> = {
  friction: "bg-amber-100 text-amber-700",
  autonomous_decision: "bg-violet-100 text-violet-700",
  architecture: "bg-violet-100 text-violet-700",
  tool_choice: "bg-green-100 text-green-700",
  approach: "bg-blue-100 text-blue-700",
  scope: "bg-amber-100 text-amber-700",
  assumption: "bg-red-100 text-red-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-900",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-red-100 text-red-700",
};

function normalizeSource(source: string): string {
  return source.split(":")[0]?.trim().toLowerCase() || source.toLowerCase();
}

export function EventBadge({ type }: { type: string }) {
  const color = EVENT_COLORS[type] ?? "bg-gray-100 text-gray-900";
  return (
    <Badge variant="secondary" className={cn("rounded text-[11px]", color)}>
      {formatEventTypeLabel(type)}
    </Badge>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-900";
  return (
    <Badge variant="secondary" className={cn("rounded text-[11px]", color)}>
      {category}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_COLORS[severity] ?? "bg-gray-100 text-gray-900";
  return (
    <Badge variant="secondary" className={cn("rounded text-[11px]", color)}>
      {severity}
    </Badge>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence) return null;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded text-[11px]",
        CONFIDENCE_COLORS[confidence] ?? "bg-gray-100 text-gray-900"
      )}
    >
      {confidence} confidence
    </Badge>
  );
}

export function ToolBadge({ name }: { name: string }) {
  return (
    <Badge variant="secondary" className="rounded text-[11px] font-mono">
      {name}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;

  const normalized = normalizeSource(source);
  const colors: Record<string, string> = {
    claude: "bg-blue-100 text-blue-700",
    codex: "bg-green-100 text-green-700",
    opencode: "bg-amber-100 text-amber-700",
  };
  const labels: Record<string, string> = {
    claude: "Claude Code",
    codex: "Codex",
    opencode: "OpenCode",
  };

  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded text-[11px]",
        colors[normalized] ?? "bg-gray-100 text-gray-900"
      )}
      title={source}
    >
      {labels[normalized] ?? source}
    </Badge>
  );
}

export function SessionTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const colors: Record<string, string> = {
    customer: "bg-blue-100 text-blue-700",
    building: "bg-violet-100 text-violet-700",
    question: "bg-green-100 text-green-700",
    other: "bg-gray-100 text-gray-900",
  };
  return (
    <Badge variant="secondary" className={cn("rounded text-[11px]", colors[type] ?? colors.other)}>
      {type}
    </Badge>
  );
}
