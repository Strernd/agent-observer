import { existsSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const GLOBAL_PLUGIN_PATH = join(
  homedir(),
  ".config",
  "opencode",
  "plugins",
  "agent-observer.js"
);
const LEGACY_PLUGIN_PATH = join(
  homedir(),
  ".config",
  "opencode",
  "plugins",
  "claude-observer.js"
);

function main() {
  let removed = false;

  if (existsSync(GLOBAL_PLUGIN_PATH)) {
    rmSync(GLOBAL_PLUGIN_PATH, { force: true });
    removed = true;
  }
  if (existsSync(LEGACY_PLUGIN_PATH)) {
    rmSync(LEGACY_PLUGIN_PATH, { force: true });
    removed = true;
  }
  if (removed) {
    console.log(
      `Removed OpenCode observer plugins ${GLOBAL_PLUGIN_PATH} and ${LEGACY_PLUGIN_PATH}`
    );
    return;
  }

  console.log("OpenCode observer plugin was not installed globally.");
}

main();
