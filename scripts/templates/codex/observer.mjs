#!/usr/bin/env node

const DEFAULT_HOOK_URL = "http://127.0.0.1:43199/api/hooks";
const HOOK_URL =
  process.env.AGENT_OBSERVER_HOOK_URL ||
  process.env.CLAUDE_OBSERVER_HOOK_URL ||
  DEFAULT_HOOK_URL;

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const input = await readStdin();
  if (!input) return;

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    console.error("[agent-observer] codex hook payload was not valid JSON");
    return;
  }

  try {
    await fetch(HOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        observer_source: "codex",
        ...payload,
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown delivery error";
    console.error(
      `[agent-observer] codex hook delivery failed: ${message}`
    );
  }
}

await main();
