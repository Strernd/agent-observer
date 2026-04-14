import path from "path";

type SessionEventForArtifacts = {
  id: number;
  eventType: string;
  toolName: string | null;
  toolInput: string | null;
  response?: string | null;
};

export type OutputArtifact = {
  path: string;
  sourceEventId: number;
  sourceTool: string;
};

type ArtifactCandidate = OutputArtifact & {
  lineageSourcePath: string;
  extension: string;
};

const SUCCESS_TOOL_EVENT_TYPES = new Set(["tool_post", "PostToolUse"]);

const DELIVERABLE_FILE_EXTENSIONS = new Set([
  ".gif",
  ".html",
  ".jpeg",
  ".jpg",
  ".md",
  ".pdf",
  ".png",
  ".svg",
  ".zip",
]);

const NON_DELIVERABLE_PATH_SEGMENTS = new Set([
  ".playwright-cli",
  ".tmp",
  "charts",
  "data",
  "node_modules",
  "temp",
  "tmp",
]);

export function extractOutputArtifacts(
  events: SessionEventForArtifacts[],
  cwd: string | null
): OutputArtifact[] {
  const finalMentionedArtifacts = extractFinalMentionedArtifacts(events, cwd);
  if (finalMentionedArtifacts.length > 0) {
    return finalMentionedArtifacts;
  }

  const artifacts = new Map<string, ArtifactCandidate>();
  const movedSourcePaths = new Set<string>();
  const movedPathTargets = new Map<string, string>();

  for (const event of events) {
    if (!SUCCESS_TOOL_EVENT_TYPES.has(event.eventType)) continue;

    const toolName = event.toolName?.trim();
    if (!toolName || !event.toolInput) continue;

    if (toolName === "Write") {
      const filePath = readJsonStringField(event.toolInput, "file_path");
      if (filePath) {
        addArtifact(artifacts, {
          cwd,
          pathValue: filePath,
          sourceEventId: event.id,
          sourceTool: toolName,
        });
      }
      continue;
    }

    if (toolName === "Bash" || toolName === "bash") {
      const command = readJsonStringField(event.toolInput, "command");
      if (!command) continue;

      for (const move of extractMoveOperations(command)) {
        const sourcePath = normalizeArtifactPath(move.sourcePath, cwd);
        const destinationPath = normalizeArtifactPath(move.destinationPath, cwd);
        if (!sourcePath || !destinationPath) continue;
        movedSourcePaths.add(sourcePath);
        movedPathTargets.set(sourcePath, destinationPath);
      }

      for (const candidate of extractPathsFromBashCommand(command)) {
        addArtifact(artifacts, {
          cwd,
          pathValue: candidate,
          sourceEventId: event.id,
          sourceTool: toolName,
        });
      }

      for (const render of extractRenderOutputs(command)) {
        const sourcePath = normalizeArtifactPath(render.inputPath, cwd);
        const outputPath = normalizeArtifactPath(render.outputPath, cwd);
        if (!sourcePath || !outputPath) continue;

        addArtifact(artifacts, {
          cwd,
          pathValue: outputPath,
          sourceEventId: event.id,
          sourceTool: toolName,
          lineageSourcePath: sourcePath,
        });
      }
    }
  }

  const filteredCandidates = Array.from(artifacts.values()).filter(
    (artifact) => !movedSourcePaths.has(artifact.path)
  );

  const latestByLineage = new Map<string, ArtifactCandidate>();
  for (const artifact of filteredCandidates) {
    const finalLineagePath = resolveMovedPath(
      artifact.lineageSourcePath,
      movedPathTargets
    );
    const lineageKey = `${finalLineagePath}::${artifact.extension}`;
    const existing = latestByLineage.get(lineageKey);
    if (!existing || existing.sourceEventId < artifact.sourceEventId) {
      latestByLineage.set(lineageKey, artifact);
    }
  }

  return Array.from(latestByLineage.values())
    .map(({ path, sourceEventId, sourceTool }) => ({
      path,
      sourceEventId,
      sourceTool,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function extractFinalMentionedArtifacts(
  events: SessionEventForArtifacts[],
  cwd: string | null
): OutputArtifact[] {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const response = event.response?.trim();
    if (!response) continue;
    if (!looksLikeFinalDeliverableMessage(response)) continue;

    const artifacts = extractArtifactsFromText(response, cwd, event.id);
    if (artifacts.length > 0) {
      return artifacts;
    }
  }

  return [];
}

function addArtifact(
  artifacts: Map<string, ArtifactCandidate>,
  input: {
    cwd: string | null;
    pathValue: string;
    sourceEventId: number;
    sourceTool: string;
    lineageSourcePath?: string;
  }
) {
  const normalizedPath = normalizeArtifactPath(input.pathValue, input.cwd);
  if (!normalizedPath) return;
  const extension = path.extname(normalizedPath).toLowerCase();
  if (!DELIVERABLE_FILE_EXTENSIONS.has(extension)) return;
  if (isNonDeliverablePath(normalizedPath, input.cwd)) return;

  const existing = artifacts.get(normalizedPath);
  if (existing && existing.sourceEventId >= input.sourceEventId) return;

  artifacts.set(normalizedPath, {
    path: normalizedPath,
    sourceEventId: input.sourceEventId,
    sourceTool: input.sourceTool,
    extension,
    lineageSourcePath:
      input.lineageSourcePath
        ? normalizeArtifactPath(input.lineageSourcePath, input.cwd) ?? normalizedPath
        : normalizedPath,
  });
}

function normalizeArtifactPath(
  rawPath: string,
  cwd: string | null
): string | null {
  const trimmed = stripShellQuotes(rawPath.trim());
  if (!trimmed) return null;
  if (trimmed.endsWith("/")) return null;
  if (trimmed.startsWith("-")) return null;
  if (trimmed.includes("$(") || trimmed.includes("${")) return null;

  const looksLikeFile =
    path.isAbsolute(trimmed) ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    DELIVERABLE_FILE_EXTENSIONS.has(path.extname(trimmed).toLowerCase());

  if (!looksLikeFile) return null;

  const resolved = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : cwd
      ? path.resolve(cwd, trimmed)
      : null;

  if (!resolved) return null;
  if (cwd && !isSubpath(resolved, cwd)) return null;

  return resolved;
}

function isNonDeliverablePath(candidatePath: string, cwd: string | null) {
  const relative = cwd ? path.relative(cwd, candidatePath) : candidatePath;
  const segments = relative.split(path.sep).filter(Boolean);
  return segments.some((segment) => NON_DELIVERABLE_PATH_SEGMENTS.has(segment));
}

function isSubpath(candidatePath: string, cwd: string) {
  const relative = path.relative(cwd, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function stripShellQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readJsonStringField(raw: string, field: string): string | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[field];
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  } catch {
    return null;
  }
}

function extractPathsFromBashCommand(command: string): string[] {
  const paths = new Set<string>();
  const addAll = (matches: Iterable<string | null | undefined>) => {
    for (const value of matches) {
      if (!value) continue;
      paths.add(value);
    }
  };

  addAll(matchAllCaptures(command, /\bmv\s+(?:"[^"]+"|'[^']+'|[^\s&;|]+)\s+("([^"]+)"|'([^']+)'|([^\s&;|]+))/g, [2, 3, 4]));
  addAll(matchAllCaptures(command, /\bcp\s+(?:"[^"]+"|'[^']+'|[^\s&;|]+)\s+("([^"]+)"|'([^']+)'|([^\s&;|]+))/g, [2, 3, 4]));
  addAll(matchAllCaptures(command, /(?:^|[\s;|&])>>?\s*("([^"]+)"|'([^']+)'|([^\s&;|]+))/gm, [2, 3, 4]));

  return Array.from(paths);
}

function extractRenderOutputs(command: string) {
  const outputs: Array<{ inputPath: string; outputPath: string }> = [];

  for (const match of command.matchAll(/\bvercel-pdf\b\s+("([^"]+)"|'([^']+)'|([^\s&;|]+))[\s\S]*?\s-o\s+("([^"]+)"|'([^']+)'|([^\s&;|]+))/g)) {
    const inputPath = firstDefined(match[2], match[3], match[4]);
    const outputPath = firstDefined(match[6], match[7], match[8]);
    if (!inputPath || !outputPath) continue;
    outputs.push({ inputPath, outputPath });
  }

  for (const match of command.matchAll(/\binteractive-report\b\s+("([^"]+)"|'([^']+)'|([^\s&;|]+))[\s\S]*?\s-o\s+("([^"]+)"|'([^']+)'|([^\s&;|]+))/g)) {
    const inputPath = firstDefined(match[2], match[3], match[4]);
    const outputPath = firstDefined(match[6], match[7], match[8]);
    if (!inputPath || !outputPath) continue;
    outputs.push({ inputPath, outputPath });
  }

  return outputs;
}

function extractMoveOperations(command: string) {
  const moves: Array<{ sourcePath: string; destinationPath: string }> = [];

  for (const match of command.matchAll(/\bmv\s+("([^"]+)"|'([^']+)'|([^\s&;|]+))\s+("([^"]+)"|'([^']+)'|([^\s&;|]+))/g)) {
    const sourcePath = firstDefined(match[2], match[3], match[4]);
    const destinationPath = firstDefined(match[6], match[7], match[8]);
    if (!sourcePath || !destinationPath) continue;
    moves.push({ sourcePath, destinationPath });
  }

  return moves;
}

function resolveMovedPath(
  inputPath: string,
  movedPathTargets: Map<string, string>
) {
  let current = inputPath;
  const seen = new Set<string>();

  while (!seen.has(current) && movedPathTargets.has(current)) {
    seen.add(current);
    current = movedPathTargets.get(current) ?? current;
  }

  return current;
}

function firstDefined(...values: Array<string | undefined>) {
  for (const value of values) {
    if (value) return value;
  }

  return null;
}

function looksLikeFinalDeliverableMessage(value: string) {
  return /\b(final|finalized|deliverable|deliverables|report files|complete)\b/i.test(
    value
  );
}

function extractArtifactsFromText(
  value: string,
  cwd: string | null,
  sourceEventId: number
): OutputArtifact[] {
  const artifacts = new Map<string, OutputArtifact>();
  const absolutePathPattern =
    /(?:\/[^\s`"'():]+)+\.(?:gif|html|jpeg|jpg|md|pdf|png|svg|zip)\b/gi;

  for (const match of value.matchAll(absolutePathPattern)) {
    const normalizedPath = normalizeArtifactPath(match[0], cwd);
    if (!normalizedPath) continue;
    const extension = path.extname(normalizedPath).toLowerCase();
    if (!DELIVERABLE_FILE_EXTENSIONS.has(extension)) continue;
    if (isNonDeliverablePath(normalizedPath, cwd)) continue;
    if (artifacts.has(normalizedPath)) continue;

    artifacts.set(normalizedPath, {
      path: normalizedPath,
      sourceEventId,
      sourceTool: "AssistantMessage",
    });
  }

  return Array.from(artifacts.values()).sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

function* matchAllCaptures(
  input: string,
  pattern: RegExp,
  groups: number[]
): Generator<string> {
  for (const match of input.matchAll(pattern)) {
    for (const groupIndex of groups) {
      const value = match[groupIndex];
      if (value) {
        yield value;
        break;
      }
    }
  }
}
