type FailureSummaryInput = {
  toolName: string | null;
  toolInput: unknown;
  toolResponse: unknown;
  error: unknown;
};

export type CanonicalFailureSummary = {
  toolName: string | null;
  operation: string | null;
  failureType: string | null;
  exitCode: number | null;
  firstActionableErrorLine: string | null;
};

function truncate(text: string, max = 240): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function safeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function toErrorString(value: unknown): string | null {
  const direct = safeString(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return null;

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return null;
    const trimmed = serialized.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function firstActionableErrorLine(errorText: string | null): string | null {
  if (!errorText) return null;

  const normalized = errorText.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  // Despite the legacy field name, preserve the full actionable excerpt.
  return truncate(normalized, 2_000);
}

function pickOperation(toolInput: unknown): string | null {
  const inputObj = toObject(toolInput);
  if (!inputObj) {
    return safeString(toolInput);
  }

  const preferredKeys = ["cmd", "command", "query", "operation", "script", "task", "path", "url"];
  for (const key of preferredKeys) {
    const value = safeString(inputObj[key]);
    if (value) return truncate(value, 220);
  }

  const serialized = JSON.stringify(inputObj);
  return serialized ? truncate(serialized, 220) : null;
}

function pickExitCode(responseObj: Record<string, unknown> | null): number | null {
  if (!responseObj) return null;
  for (const key of ["exitCode", "exit_code", "statusCode", "status"]) {
    const value = responseObj[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Math.round(Number(value));
    }
  }
  return null;
}

function pickErrorText(
  responseObj: Record<string, unknown> | null,
  error: unknown,
  toolResponse: unknown
): string | null {
  const directError = toErrorString(error);
  if (directError) return directError;

  if (responseObj) {
    const candidates = [
      responseObj.error,
      responseObj.stderr,
      responseObj.message,
      responseObj.detail,
    ];
    for (const candidate of candidates) {
      const text = toErrorString(candidate);
      if (text) return text;
    }
  }

  return toErrorString(toolResponse);
}

function inferFailureType(
  responseObj: Record<string, unknown> | null,
  exitCode: number | null,
  errorLine: string | null
): string | null {
  if (responseObj) {
    for (const key of ["failureType", "failure_type", "type", "errorType", "name"]) {
      const value = safeString(responseObj[key]);
      if (value) return value.toLowerCase();
    }
  }

  if (exitCode !== null) return "exit_code";
  if (!errorLine) return null;

  const lower = errorLine.toLowerCase();
  if (lower.includes("timed out") || lower.includes("timeout")) return "timeout";
  if (lower.includes("permission denied") || lower.includes("eacces")) return "permission_denied";
  if (lower.includes("not found") || lower.includes("enoent")) return "not_found";
  if (lower.includes("schema")) return "schema_error";
  if (lower.includes("validation")) return "validation_error";
  return "runtime_error";
}

export function buildCanonicalFailureSummary(
  input: FailureSummaryInput
): CanonicalFailureSummary {
  const responseObj = toObject(input.toolResponse);
  const operation = pickOperation(input.toolInput);
  const exitCode = pickExitCode(responseObj);
  const errorText = pickErrorText(responseObj, input.error, input.toolResponse);
  const firstLine = firstActionableErrorLine(errorText);
  const failureType = inferFailureType(responseObj, exitCode, firstLine);

  return {
    toolName: input.toolName,
    operation,
    failureType,
    exitCode,
    firstActionableErrorLine: firstLine,
  };
}

export function buildWhatFailed(summary: CanonicalFailureSummary): string | null {
  const tool = summary.toolName ?? "tool execution";
  const operation = summary.operation ? ` while running ${summary.operation}` : "";
  const failureType = summary.failureType ? ` (${summary.failureType})` : "";
  const exit = summary.exitCode !== null ? ` with exit code ${summary.exitCode}` : "";
  const detail = summary.firstActionableErrorLine
    ? `: ${summary.firstActionableErrorLine}`
    : "";
  return truncate(`${tool} failed${operation}${exit}${failureType}${detail}`, 320);
}
