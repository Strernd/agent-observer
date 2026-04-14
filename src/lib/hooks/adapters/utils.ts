function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function toRecord(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseMaybeJsonObject(
  value: unknown
): Record<string, unknown> | null {
  if (typeof value === "string") {
    return toRecord(tryParseJson(value));
  }

  return toRecord(value);
}

export function withSourcePrefix(
  source: "claude" | "codex" | "opencode",
  detail: unknown
): string {
  const suffix = pickString(detail);
  return suffix ? `${source}:${suffix}` : source;
}
