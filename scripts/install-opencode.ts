import { copyFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const OPENCODE_DIR = join(homedir(), ".config", "opencode");
const PLUGINS_DIR = join(OPENCODE_DIR, "plugins");
const GLOBAL_PLUGIN_PATH = join(PLUGINS_DIR, "agent-observer.js");
const SOURCE_PLUGIN_PATH = join(
  process.cwd(),
  "scripts",
  "templates",
  "opencode",
  "observer.js"
);

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function main() {
  ensureDir(PLUGINS_DIR);
  copyFileSync(SOURCE_PLUGIN_PATH, GLOBAL_PLUGIN_PATH);

  console.log(`Installed OpenCode observer plugin at ${GLOBAL_PLUGIN_PATH}`);
  console.log("\nOpenCode observer plugin installed globally.");
}

main();
