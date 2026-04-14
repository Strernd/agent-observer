import { readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const BACKUP_PATH = join(homedir(), ".claude", "settings.json.bak");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 43199;
const DEFAULT_HOOK_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}/api/hooks`;
const LEGACY_HOOK_URLS = [
  "https://cc-observer.localhost/api/hooks",
  DEFAULT_HOOK_URL,
  "http://localhost:3456/api/hooks",
  "http://localhost:3000/api/hooks",
];
const HOOK_TIMEOUT = 5;
const CA_CERT_PATH = "/tmp/portless/ca.pem";
const HOOK_URL_ENV = "AGENT_OBSERVER_HOOK_URL";
const LEGACY_HOOK_URL_ENV = "CLAUDE_OBSERVER_HOOK_URL";

const EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "SubagentStart",
  "SubagentStop",
];

type Settings = Record<string, unknown>;
type Hook = { type?: string; url?: string; timeout?: number };
type HookEntry = { matcher?: string; hooks?: Hook[] } & Record<string, unknown>;

function selectHookTarget() {
  const configuredHookUrl = process.env[HOOK_URL_ENV]?.trim();
  if (configuredHookUrl) {
    return {
      hookUrl: configuredHookUrl,
      reason: `Using ${HOOK_URL_ENV} override`,
    };
  }

  const legacyHookUrl = process.env[LEGACY_HOOK_URL_ENV]?.trim();
  if (legacyHookUrl) {
    return {
      hookUrl: legacyHookUrl,
      reason: `Using ${LEGACY_HOOK_URL_ENV} override`,
    };
  }

  return {
    hookUrl: DEFAULT_HOOK_URL,
    reason: `Using default local hook endpoint on ${DEFAULT_HOST}:${DEFAULT_PORT}`,
  };
}

function removeObserverHooks(entries: unknown[]) {
  let removed = 0;
  const filteredEntries: HookEntry[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      filteredEntries.push(entry as HookEntry);
      continue;
    }

    const hookEntry = entry as HookEntry;
    if (!Array.isArray(hookEntry.hooks)) {
      filteredEntries.push(hookEntry);
      continue;
    }

    const remainingHooks = hookEntry.hooks.filter((hook) => {
      const isObserverHook =
        hook.type === "http" && LEGACY_HOOK_URLS.includes(hook.url ?? "");
      if (isObserverHook) {
        removed++;
      }
      return !isObserverHook;
    });

    if (remainingHooks.length > 0) {
      filteredEntries.push({
        ...hookEntry,
        hooks: remainingHooks,
      });
    }
  }

  return { filteredEntries, removed };
}

function main() {
  const { hookUrl, reason } = selectHookTarget();

  // Read existing settings
  let settings: Settings;
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
  } catch {
    console.error(`Could not read ${SETTINGS_PATH}`);
    process.exit(1);
  }

  // Backup
  copyFileSync(SETTINGS_PATH, BACKUP_PATH);
  console.log(`Backed up to ${BACKUP_PATH}`);
  console.log(`Using hook target ${hookUrl}`);
  console.log(reason);

  // Remove the old portless CA override when present.
  if (settings.env && typeof settings.env === "object") {
    const env = settings.env as Record<string, string>;
    if (env.NODE_EXTRA_CA_CERTS === CA_CERT_PATH) {
      delete env.NODE_EXTRA_CA_CERTS;
      console.log(`Removed NODE_EXTRA_CA_CERTS=${CA_CERT_PATH}`);
    }
  }

  // Ensure hooks object exists
  if (!settings.hooks || typeof settings.hooks !== "object") {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;

  let added = 0;
  let removed = 0;

  for (const event of EVENTS) {
    if (!Array.isArray(hooks[event])) {
      hooks[event] = [];
    }

    const currentEntries = hooks[event] as unknown[];
    const { filteredEntries, removed: removedForEvent } =
      removeObserverHooks(currentEntries);
    removed += removedForEvent;

    filteredEntries.push({
      hooks: [
        {
          type: "http",
          url: hookUrl,
          timeout: HOOK_TIMEOUT,
        } as Record<string, unknown>,
      ],
    });

    hooks[event] = filteredEntries;
    added++;
  }

  // Write back
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");

  console.log(`Installed ${added} hook registrations at ${hookUrl}`);
  console.log(`Removed ${removed} stale Agent Observer hook registrations`);
  console.log(`Updated ${SETTINGS_PATH}`);
  console.log("\nAgent Observer hooks installed. Start the server with: pnpm dev");
}

main();
