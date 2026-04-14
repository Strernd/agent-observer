# Agent Observer

Agent Observer records local coding-agent sessions and turns them into searchable timelines, AI summaries, extracted decisions/friction, ticket views, and daily/aggregate analytics.

It runs as a local Next.js app backed by SQLite (`observer.db`) and ingests events from Claude Code, Codex, and OpenCode hooks.

## Typical Use Cases

- Track what happened in long agent sessions without rereading full transcripts.
- Group sessions by ticket/customer automatically from directory or naming patterns.
- Review friction patterns and autonomous agent decisions.
- Use frictions insights to improve agent setup and fine-tune skills.
- Generate ticket-level and day-level summaries for handoff/status updates.
- Monitor adoption/reliability trends across agents, models, tools, and skills.

## Features

- Multi-source hook ingestion with normalized event types.
- Local session timeline with prompts, tool calls, failures, and raw payloads.
- Session summaries with tools/skills used, friction points, artifacts, and session type classification.
- Decision extraction per session (`autonomous_decision` and `friction`) with evidence event IDs.
- Ticket views aggregating multiple sessions and ticket-level AI summaries.
- Daily reports with top accomplishments, friction highlights, and suggestions.
- Stats dashboard for trends (activity, agents/models, tools, friction, ticket coverage).
- Manual overrides for session ticket and session name.

## Quick Start (Fresh Clone)

### 0. Prerequisites

- Node.js 20+
- `pnpm`

### 1. Create local config files

```bash
cp observer.config.example.json observer.config.json
cp example.env .env.local
```

### 2. Fill required settings

In `.env.local`, set:

```bash
AI_GATEWAY_API_KEY=...
```

This key is required for AI-powered features (session summaries, decision extraction, ticket summaries, daily reports). Event capture still works without it.

In `observer.config.json`, set:

- `linear.baseUrl` (optional but recommended)
- `extraction.rules` for your naming conventions
- optional model overrides in `models`

### 3. Install and initialize DB

```bash
pnpm install
pnpm db:push
```

### 4. Start the app

```bash
pnpm dev
```

Open [http://127.0.0.1:43199](http://127.0.0.1:43199).

### 5. Install hooks for the agent(s) you use

```bash
pnpm run install-claude-hooks     # Claude Code
pnpm run install-codex-hooks      # Codex
pnpm run install-opencode-hooks   # OpenCode
```

The default hook target is `http://127.0.0.1:43199/api/hooks`.
Override with `AGENT_OBSERVER_HOOK_URL` if needed.

### 6. Verify first ingestion

Run one short session in your agent, then refresh the app:

- `Overview` should show at least one session/event.
- `Sessions` should list the new session.
- Session detail should show events, then summary once generated.

## Hook Notes

Global installers modify your user-level config:

- Claude installer updates `~/.claude/settings.json`
- Codex installer updates `~/.codex/config.toml`, `~/.codex/hooks.json`, and bridge script
- OpenCode installer copies plugin to `~/.config/opencode/plugins/agent-observer.js`

Uninstall commands:

```bash
pnpm run uninstall-claude-hooks
pnpm run uninstall-codex-hooks
pnpm run uninstall-opencode-hooks
```

For adapter/event mapping details, see [HOOKS.md](./HOOKS.md).

## Configuration Reference

All config lives in `observer.config.json`.

```json
{
  "linear": {
    "baseUrl": "https://linear.app/acme/issue"
  },
  "models": {
    "summary": "anthropic/claude-sonnet-4",
    "extraction": "anthropic/claude-opus-4-6"
  },
  "reports": {
    "autoProcessPreviousDayOnFirstEvent": false
  },
  "extraction": {
    "rules": [
      {
        "id": "ticket-from-directory",
        "input": "cwdBasename",
        "pattern": "^(?<customer>.+)-(?<ticket>[A-Z]+-\\d+)$",
        "flags": "i",
        "outputs": {
          "ticketId": "{{ticket | upper}}",
          "customer": "{{customer}}",
          "sessionName": "{{cwdBasename}}",
          "sessionGroup": "{{customer}}",
          "data.repo": "{{cwdBasename}}"
        }
      }
    ]
  }
}
```

### `linear.baseUrl`

- Format: `https://linear.app/<workspace>/issue`
- Used to render clickable ticket links.
- Leave empty to disable external ticket linking.

### `models`

- `summary`: model for session/ticket/day summaries
- `extraction`: model for decision extraction

Defaults:

- `summary`: `anthropic/claude-sonnet-4`
- `extraction`: `anthropic/claude-opus-4-6`

### `reports.autoProcessPreviousDayOnFirstEvent`

If `true`, first visible event of a new local day can auto-process the previous day report once.

### `extraction.rules`

Rules run on each ingested event and can populate:

- `ticketId`
- `customer`
- `sessionName`
- `sessionGroup`
- arbitrary `data.<key>` fields (stored in `sessions.extracted_data`)

Rule inputs:

- `cwd`
- `cwdBasename`
- `source`
- `model`

Template values:

- `cwd`, `cwdBasename`, `source`, `model`, `linearBaseUrl`
- named regex groups (`{{ticket}}`, `{{customer}}`, etc.)
- numeric groups (`{{1}}`, `{{2}}`, etc.)

Template filters:

- `upper`
- `lower`
- `trim`

Important: the default example pattern is a placeholder. Replace it with your real branch/directory naming convention or extraction will be misleading.

## UI Guide

- `Overview`: top-level activity, recent tickets, untagged sessions, latest day report.
- `Sessions`: searchable session list + batch summary/decision actions.
- `Session Detail`: tabs for Summary, Decisions, Friction, and raw Events.
- `Tickets`: grouped ticket list, artifact counts, summary freshness.
- `Ticket Detail`: cross-session ticket summary, tool/skill stats, session list.
- `Reports`: day-by-day AI report history.
- `Stats`: trend analytics with filters for time range/source/model/session type/tickets/tools.

## API Endpoints

Base local origin: `http://127.0.0.1:43199`

### Hook Ingestion

- `POST /api/hooks`
  - Accepts normalized or source-specific hook payloads.
  - Stores normalized event rows and raw payload JSON.

### Session Endpoints

- `GET /api/sessions/:id/events`
  - Query: `limit` (default `100`, max `500`), `cursor`, `includePayload=1`
- `POST /api/sessions/:id/summarize`
- `PATCH /api/sessions/:id/tag`
  - Body fields: `ticketId`, `customer`, `sessionName`
- `GET /api/sessions/:id/artifacts?path=<absolute-path>[&disposition=attachment]`
- `GET /api/sessions/:id/decisions`
  - Returns decisions from latest successful extraction run for that session.
- `GET /api/sessions/:id/decisions/runs/latest`
- `POST /api/sessions/:id/decisions/extract`
- `POST /api/sessions/summaries/batch`
- `POST /api/sessions/decisions/batch`

### Ticket Endpoints

- `POST /api/tickets/:id/summarize`

### Daily Report Endpoints

- `GET /api/reports/daily/:date` (`YYYY-MM-DD`)
- `POST /api/reports/daily/:date`

## NPM Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm db:push
pnpm db:studio

pnpm run install-claude-hooks
pnpm run uninstall-claude-hooks
pnpm run install-codex-hooks
pnpm run uninstall-codex-hooks
pnpm run install-opencode-hooks
pnpm run uninstall-opencode-hooks
```

## Data and Privacy Notes

- Data is stored locally in `observer.db`.
- Full hook payloads are stored in `events.payload`.
- Prompts/responses and tool inputs/outputs may include sensitive data.
- AI calls are made only when summary/extraction/report features run.

## Troubleshooting

- No sessions appear:
  - Confirm app is running at `http://127.0.0.1:43199`
  - Re-run the correct hook installer
  - Check hook URL override env (`AGENT_OBSERVER_HOOK_URL`)
- Summaries/decisions do not populate:
  - Verify `AI_GATEWAY_API_KEY` in `.env.local`
  - Retry from session/ticket UI actions
- Ticket links do not open:
  - Set `linear.baseUrl` correctly
- Ticket grouping is wrong:
  - Replace placeholder extraction rule with your real naming pattern
