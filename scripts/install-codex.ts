import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CODEX_DIR = join(homedir(), ".codex");
const CONFIG_PATH = join(CODEX_DIR, "config.toml");
const CONFIG_BACKUP_PATH = join(CODEX_DIR, "config.toml.bak");
const HOOKS_PATH = join(CODEX_DIR, "hooks.json");
const HOOKS_BACKUP_PATH = join(CODEX_DIR, "hooks.json.bak");
const BRIDGE_DIR = join(CODEX_DIR, "agent-observer");
const BRIDGE_PATH = join(BRIDGE_DIR, "observer.mjs");
const BRIDGE_SOURCE_PATH = join(
  process.cwd(),
  "scripts",
  "templates",
  "codex",
  "observer.mjs"
);
const HOOK_URL_ENV = "AGENT_OBSERVER_HOOK_URL";
const LEGACY_HOOK_URL_ENV = "CLAUDE_OBSERVER_HOOK_URL";
const EVENTS = [
  { name: "SessionStart", matcher: "startup|resume" },
  { name: "PreToolUse", matcher: "Bash" },
  { name: "PostToolUse", matcher: "Bash" },
  { name: "UserPromptSubmit" },
  { name: "Stop" },
] as const;

type CodexHook = {
  type?: string;
  command?: string;
  timeout?: number;
};

type CodexHookEntry = {
  matcher?: string;
  hooks?: CodexHook[];
} & Record<string, unknown>;

type HooksFile = {
  hooks?: Record<string, CodexHookEntry[]>;
} & Record<string, unknown>;

function shellQuote(path: string): string {
  return `'${path.replaceAll("'", `'\\''`)}'`;
}

function buildCommand() {
  return `node ${shellQuote(BRIDGE_PATH)}`;
}

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function installConfig() {
  let existing = "";
  if (existsSync(CONFIG_PATH)) {
    existing = readFileSync(CONFIG_PATH, "utf8");
    writeFileSync(CONFIG_BACKUP_PATH, existing);
  }

  const normalized = existing.replace(/\r\n/g, "\n");
  const featuresHeader = /^\[features\]\s*$/m;
  const codexHooksLine = /^\s*codex_hooks\s*=\s*(true|false)\s*$/m;

  let next = normalized;

  if (!featuresHeader.test(normalized)) {
    next =
      normalized.replace(/\s*$/, "") +
      `${normalized.trim().length > 0 ? "\n\n" : ""}[features]\ncodex_hooks = true\n`;
  } else if (codexHooksLine.test(normalized)) {
    next = normalized.replace(codexHooksLine, "codex_hooks = true");
  } else {
    next = normalized.replace(featuresHeader, "[features]\ncodex_hooks = true");
  }

  writeFileSync(CONFIG_PATH, next);
}

function removeExistingObserverHooks(entries: CodexHookEntry[], command: string) {
  let removed = 0;
  const filteredEntries = entries.flatMap((entry) => {
    if (!Array.isArray(entry.hooks)) {
      return [entry];
    }

    const remainingHooks = entry.hooks.filter((hook) => {
      const isObserverHook =
        hook.type === "command" &&
        typeof hook.command === "string" &&
        (hook.command === command ||
          hook.command.includes(BRIDGE_PATH) ||
          hook.command.includes("agent-observer/observer.mjs") ||
          hook.command.includes("claude-observer/observer.mjs"));

      if (isObserverHook) {
        removed++;
      }

      return !isObserverHook;
    });

    if (remainingHooks.length === 0) {
      return [];
    }

    return [{ ...entry, hooks: remainingHooks }];
  });

  return { filteredEntries, removed };
}

function installHooks() {
  let hooksFile: HooksFile = {};
  if (existsSync(HOOKS_PATH)) {
    const raw = readFileSync(HOOKS_PATH, "utf8");
    hooksFile = JSON.parse(raw) as HooksFile;
    writeFileSync(HOOKS_BACKUP_PATH, raw);
  }

  if (!hooksFile.hooks || typeof hooksFile.hooks !== "object") {
    hooksFile.hooks = {};
  }

  const command = buildCommand();
  let removed = 0;

  for (const event of EVENTS) {
    const currentEntries = Array.isArray(hooksFile.hooks[event.name])
      ? hooksFile.hooks[event.name]
      : [];

    const result = removeExistingObserverHooks(currentEntries, command);
    removed += result.removed;
    const matcher = "matcher" in event ? event.matcher : undefined;

    result.filteredEntries.push({
      ...(matcher ? { matcher } : {}),
      hooks: [
        {
          type: "command",
          command,
          timeout: 5,
        },
      ],
    });

    hooksFile.hooks[event.name] = result.filteredEntries;
  }

  writeFileSync(HOOKS_PATH, JSON.stringify(hooksFile, null, 2) + "\n");
  return removed;
}

function main() {
  ensureDir(CODEX_DIR);
  ensureDir(BRIDGE_DIR);

  copyFileSync(BRIDGE_SOURCE_PATH, BRIDGE_PATH);
  installConfig();
  const removed = installHooks();

  console.log(`Installed Codex bridge script at ${BRIDGE_PATH}`);
  console.log(`Enabled codex_hooks in ${CONFIG_PATH}`);
  console.log(`Updated ${HOOKS_PATH}`);
  console.log(`Removed ${removed} stale Codex observer hook registrations`);
  console.log(`Bridge reads ${HOOK_URL_ENV} with ${LEGACY_HOOK_URL_ENV} fallback`);
  console.log("\nCodex observer hooks installed globally.");
}

main();
