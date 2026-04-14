import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const HOOK_URLS = [
  "https://cc-observer.localhost/api/hooks",
  "http://127.0.0.1:43199/api/hooks",
  "http://localhost:3000/api/hooks",
  "http://localhost:3456/api/hooks",
];

function main() {
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
  } catch {
    console.error(`Could not read ${SETTINGS_PATH}`);
    process.exit(1);
  }

  if (!settings.hooks || typeof settings.hooks !== "object") {
    console.log("No hooks found in settings.");
    return;
  }

  const hooks = settings.hooks as Record<string, unknown[]>;
  let removed = 0;

  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;

    const filtered = entries.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") {
        return [entry];
      }

      const e = entry as {
        hooks?: Array<{ type?: string; url?: string }>;
      };
      if (!Array.isArray(e.hooks)) {
        return [entry];
      }

      const remainingHooks = e.hooks.filter((h) => {
        const isOurHook =
          h.type === "http" && HOOK_URLS.includes(h.url ?? "");
        if (isOurHook) removed++;
        return !isOurHook;
      });

      if (remainingHooks.length === 0) {
        return [];
      }

      return [{ ...e, hooks: remainingHooks }];
    });

    if (filtered.length === 0) {
      delete hooks[event];
    } else {
      hooks[event] = filtered;
    }
  }

  // Remove NODE_EXTRA_CA_CERTS if it points to portless
  if (settings.env && typeof settings.env === "object") {
    const env = settings.env as Record<string, string>;
    if (env.NODE_EXTRA_CA_CERTS === "/tmp/portless/ca.pem") {
      delete env.NODE_EXTRA_CA_CERTS;
      console.log("Removed NODE_EXTRA_CA_CERTS from env");
    }
  }

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
  console.log(`Removed ${removed} hook registrations from ${SETTINGS_PATH}`);
}

main();
