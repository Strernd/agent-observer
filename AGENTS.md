# Agent Observer

## Onboarding (Fresh Install)

When onboarding a new user or working in a fresh clone, walk them through these steps in order:

### 1. Config files

Two files need to be copied from their examples before the app can run:

```bash
cp observer.config.example.json observer.config.json
cp example.env .env.local
```

- `observer.config.json` — extraction rules, Linear workspace URL, and AI model overrides. See [README.md](./README.md) for the full config reference.
- `.env.local` — set `AI_GATEWAY_API_KEY` to your AI gateway API key. This is required for session summaries and decision extraction to work.

### 2. Database

The app uses a local SQLite database (`observer.db`). Create it from the Drizzle schema:

```bash
pnpm install
pnpm db:push
```

This creates all tables from scratch. No seed data is needed — sessions populate as hooks fire.

### 3. Dev server

```bash
pnpm dev
```

Runs on `http://127.0.0.1:43199`. Do not start the dev server on behalf of the user — ask them to start it if the origin is unreachable.

### 4. Hook installation

Install hooks for the agent(s) the user works with:

```bash
pnpm run install-claude-hooks     # Claude Code
pnpm run install-codex-hooks      # Codex
pnpm run install-opencode-hooks   # OpenCode
```

Override the hook endpoint: set `AGENT_OBSERVER_HOOK_URL` (default `http://127.0.0.1:43199/api/hooks`).

### 5. Extraction rules

Check whether extraction is effectively unset:

- `observer.config.json` doesn't exist yet, or
- `linear.baseUrl` is empty, or
- `extraction.rules` is empty, or
- the config still has the generic example folder-grouping rule rather than the user's real naming convention

If extraction is not meaningfully configured, ask the user whether they want you to set up:

- Linear ticket extraction
- Session naming extraction
- Session grouping extraction

Do not silently invent extraction rules. Ask first, then configure them based on the user's actual branch, directory, or naming patterns. See [README.md](./README.md) for extraction rule syntax.

---

# Session API Endpoints

Preferred local origin: `http://127.0.0.1:43199`
Override origin when needed: set `AGENT_OBSERVER_HOOK_URL`

Base path: `/api/sessions/:id`

## Get Events

- Route: `GET /api/sessions/:id/events`
- Query params:
  - `limit` (optional, default `100`, max `500`)
  - `cursor` (optional, row-id cursor from previous response)
  - `includePayload` (optional, set `1` to include full event payload)
- Response:
  - `sessionId`
  - `limit`
  - `cursor`
  - `count`
  - `hasMore`
  - `nextCursor`
  - `events` (ordered by ascending `id`)

Example:

```bash
curl "http://127.0.0.1:43199/api/sessions/<session-id>/events?limit=100"
curl "http://127.0.0.1:43199/api/sessions/<session-id>/events?limit=100&cursor=<nextCursor>"
curl "http://127.0.0.1:43199/api/sessions/<session-id>/events?limit=100&includePayload=1"
```

## Get Decisions

- Route: `GET /api/sessions/:id/decisions`
- Query params:
  - `limit` (optional, default `100`, max `500`)
  - `cursor` (optional, row-id cursor from previous response)
  - `status` (optional, for example `active`, `superseded`, `rejected`)
- Response:
  - `sessionId`
  - `status` (echoed query param or `null`)
  - `limit`
  - `cursor`
  - `count`
  - `hasMore`
  - `nextCursor`
  - `decisions` (ordered by ascending `id`)

Example:

```bash
curl "http://127.0.0.1:43199/api/sessions/<session-id>/decisions?status=active&limit=100"
curl "http://127.0.0.1:43199/api/sessions/<session-id>/decisions?status=active&limit=100&cursor=<nextCursor>"
```
