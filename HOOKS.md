# Hook Adapters

This project now normalizes multiple coding-agent hook systems into one internal event model.

## Supported Sources

- Claude Code via `POST /api/hooks`
- Codex via global `~/.codex/hooks.json` and `~/.codex/agent-observer/observer.mjs`
- OpenCode via global `~/.config/opencode/plugins/agent-observer.js`

## Local Endpoint

- Preferred origin: `http://127.0.0.1:43199`
- Override with `AGENT_OBSERVER_HOOK_URL`
- Route: `/api/hooks`

## Claude Code

Claude hooks are installed globally from this repo.

Install:

```bash
pnpm run install-claude-hooks
```

Uninstall:

```bash
pnpm run uninstall-claude-hooks
```

These commands update `~/.claude/settings.json` by adding/removing HTTP hook registrations that post to `/api/hooks`.

## Codex

Codex hooks are installed globally.

### Global install

Run:

```bash
pnpm run install-codex-hooks
```

This installs:

- `~/.codex/config.toml`
  ensures `[features] codex_hooks = true`
- `~/.codex/hooks.json`
  registers the observer hooks globally
- `~/.codex/agent-observer/observer.mjs`
  bridge script that forwards hook payloads into this app

Use this when you want Codex sessions from any working directory to show up here.

Uninstall with:

```bash
pnpm run uninstall-codex-hooks
```

Notes:

- Codex hooks are currently experimental and disabled on Windows in the official docs.
- Current Codex hook coverage is strongest for Bash tool calls.
- Codex does not currently emit a true `SessionEnd`, so this app summarizes Codex sessions from the `Stop` hook.
- The installer copies the bridge template from `scripts/templates/codex/observer.mjs`.

## OpenCode

OpenCode hooks are installed globally.

### Global install

Run:

```bash
pnpm run install-opencode-hooks
```

This copies the observer plugin to:

- `~/.config/opencode/plugins/agent-observer.js`

OpenCode loads global plugins from `~/.config/opencode/plugins/` automatically at startup, so this makes the observer work from any working directory.

Uninstall with:

```bash
pnpm run uninstall-opencode-hooks
```

The plugin forwards:

- `session.created`
- `session.deleted`
- `session.idle`
- `session.error`
- user prompts from `chat.message`
- tool calls from `tool.execute.before` and `tool.execute.after`
- tool failures and final assistant text from `message.part.updated`
- The installer copies the plugin template from `scripts/templates/opencode/observer.js`.

## Internal Normalization

Source adapters live in `src/lib/hooks/adapters/` and normalize incoming payloads into canonical event types such as:

- `session_start`
- `session_end`
- `session_idle`
- `user_prompt`
- `assistant_message`
- `tool_pre`
- `tool_post`
- `tool_error`

The ingestion route persists only normalized event types while preserving the original payload JSON in `events.payload`.
