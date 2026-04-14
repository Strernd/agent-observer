import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CODEX_DIR = join(homedir(), ".codex");
const CONFIG_PATH = join(CODEX_DIR, "config.toml");
const HOOKS_PATH = join(CODEX_DIR, "hooks.json");
const BRIDGE_DIR = join(CODEX_DIR, "agent-observer");
const BRIDGE_PATH = join(BRIDGE_DIR, "observer.mjs");
const LEGACY_BRIDGE_DIR = join(CODEX_DIR, "claude-observer");
const LEGACY_BRIDGE_PATH = join(LEGACY_BRIDGE_DIR, "observer.mjs");

type CodexHook = {
  type?: string;
  command?: string;
};

type CodexHookEntry = {
  hooks?: CodexHook[];
} & Record<string, unknown>;

type HooksFile = {
  hooks?: Record<string, CodexHookEntry[]>;
} & Record<string, unknown>;

function stripCodexHooksFlag(configText: string): string {
  const lines = configText.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let inFeatures = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isSection = /^\[.+\]$/.test(trimmed);

    if (trimmed === "[features]") {
      inFeatures = true;
      output.push(line);
      continue;
    }

    if (isSection) {
      inFeatures = false;
    }

    if (
      inFeatures &&
      /^\s*codex_hooks\s*=/.test(line)
    ) {
      continue;
    }

    output.push(line);
  }

  const compacted: string[] = [];
  for (let index = 0; index < output.length; index++) {
    const line = output[index];
    const next = output[index + 1];
    if (line.trim() === "[features]" && (next === undefined || next.trim() === "" || /^\[.+\]$/.test(next.trim()))) {
      continue;
    }
    compacted.push(line);
  }

  return compacted.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");
}

function uninstallHooks() {
  if (!existsSync(HOOKS_PATH)) {
    return 0;
  }

  const hooksFile = JSON.parse(readFileSync(HOOKS_PATH, "utf8")) as HooksFile;
  if (!hooksFile.hooks || typeof hooksFile.hooks !== "object") {
    return 0;
  }

  let removed = 0;

  for (const [eventName, entries] of Object.entries(hooksFile.hooks)) {
    if (!Array.isArray(entries)) continue;

    const filteredEntries = entries.flatMap((entry) => {
      if (!Array.isArray(entry.hooks)) {
        return [entry];
      }

      const remainingHooks = entry.hooks.filter((hook) => {
        const isObserverHook =
          hook.type === "command" &&
          typeof hook.command === "string" &&
          (hook.command.includes(BRIDGE_PATH) ||
            hook.command.includes(LEGACY_BRIDGE_PATH) ||
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

    if (filteredEntries.length === 0) {
      delete hooksFile.hooks[eventName];
    } else {
      hooksFile.hooks[eventName] = filteredEntries;
    }
  }

  writeFileSync(HOOKS_PATH, JSON.stringify(hooksFile, null, 2) + "\n");
  return removed;
}

function uninstallConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return false;
  }

  const current = readFileSync(CONFIG_PATH, "utf8");
  const next = stripCodexHooksFlag(current);
  if (next !== current) {
    writeFileSync(CONFIG_PATH, next);
    return true;
  }

  return false;
}

function main() {
  const removedHooks = uninstallHooks();
  const removedConfig = uninstallConfig();

  if (existsSync(BRIDGE_DIR)) {
    rmSync(BRIDGE_DIR, { recursive: true, force: true });
  }
  if (existsSync(LEGACY_BRIDGE_DIR)) {
    rmSync(LEGACY_BRIDGE_DIR, { recursive: true, force: true });
  }

  console.log(`Removed ${removedHooks} Codex observer hook registrations`);
  if (removedConfig) {
    console.log(`Removed codex_hooks flag from ${CONFIG_PATH}`);
  }
  console.log(`Removed bridge paths ${BRIDGE_PATH} and ${LEGACY_BRIDGE_PATH}`);
}

main();
