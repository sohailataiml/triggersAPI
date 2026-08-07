# Zapier AI Automation Copilot

**Powered by TriggersAPI + MCP.** Demo project for the GauntletAI × Zapier
Partner Challenge — not an official Zapier product.

`apps/copilot` is an AI client that operates TriggersAPI in natural language.
It is a consumer of the [MCP server](./mcp.md), not a second control plane: every
action the Copilot takes is a real MCP tool call against the running platform,
and the Explorer shows the same state changing live.

The point it demonstrates: **TriggersAPI lets systems publish events once and
lets workflows — or AI agents — consume them reliably.** MCP is what makes the
same event infrastructure operable by an agent.

---

## Contents

- [Architecture](#architecture)
- [How MCP is used](#how-mcp-is-used)
- [Local startup](#local-startup)
- [Environment variables](#environment-variables)
- [Example prompts](#example-prompts)
- [Demo script](#demo-script)
- [Agent behaviour](#agent-behaviour)
- [Security notes](#security-notes)
- [Testing](#testing)
- [Known limitations](#known-limitations)

## Architecture

```
User
  ↓
Zapier AI Automation Copilot        apps/copilot  (browser, port 5174)
  ↓  POST /copilot/chat — SSE stream of agent events
LLM / Agent Runtime                 apps/copilot  (server, port 3200)
  ↓  Anthropic Messages API, streaming tool loop
MCP Client                          Streamable HTTP
  ↓
TriggersAPI MCP Server              apps/mcp      (port 3100)
  ↓
TriggersAPI REST API                apps/api      (port 3000)
  ↓
PostgreSQL + Redis + BullMQ
  ↓
Explorer receives live SSE updates  apps/explorer (port 5173)
```

The browser never holds a credential. The model key and the Triggers role tokens
live in the Copilot server's environment; the page talks only to `/copilot/*`.

## How MCP is used

The Copilot **discovers** its capabilities rather than hard-coding them. On
connect it calls `tools/list` and `resources/list`, converts the returned JSON
Schemas straight into Claude tool definitions, and builds its system prompt from
whatever came back. Three consequences:

- **No renamed tools.** The frontend adapts to the MCP server's real names.
- **Role gating is honoured end to end.** A producer-only credential registers
  only `ingest_event`; the capability strip shows Consumer and Admin struck
  through, the suggested prompts for those actions disappear, and the agent is
  told plainly that it cannot perform them.
- **Adding a tool to the MCP server surfaces it here** with no Copilot change.

Every platform mutation goes through MCP. The one read path that does not is the
live activity stream: MCP has no streaming resource, so the Copilot server
proxies the API's SSE endpoint for visualization only. Delivery, subscription,
and overview reads in the context panel all go through MCP tools.

## Local startup

**One command.** From the repository root:

```bash
pnpm demo
```

That starts Postgres and Redis, applies migrations, provisions the demo
workspace, writes working tokens into `.env`, and launches all five services.
Then open:

- **Copilot** — <http://localhost:5174>
- **Explorer** — <http://localhost:5173>

Both are already connected. Nobody types or pastes a token: the Copilot's
credentials live in its server's environment, and the Explorer picks up
`VITE_DEMO_*` from the same `.env`. Stop the containers afterwards with
`pnpm demo:stop`.

**The one thing you must supply is a model key.** Everything else is generated.
Put it in `.env` before running:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Without it the whole stack still runs and the Explorer works, but the Copilot
shows a setup screen instead of answering — it will not present a chat box that
fails on first use.

### What `pnpm demo` does

| Step         | Behaviour                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `demo:up`    | `docker compose up --wait` for Postgres/Redis, then `prisma migrate deploy`                                     |
| `demo:setup` | Idempotent: reuses the demo workspace and any `.env` tokens that still authenticate, mints only what is missing |
| `demo:run`   | Runs api, worker, mcp, copilot, explorer together (`concurrently -k`, so Ctrl-C stops all of them)              |

`demo:setup` is safe to re-run and converges rather than accumulating: repeated
runs reuse the same workspace and tokens. It differs from `db:seed`, which is
left alone and always mints a fresh workspace.

Three details it handles that otherwise bite:

- **The consumer key is created unscoped.** `db:seed` scopes it to the seeded
  subscription, so the moment the Copilot creates its own subscription, leasing
  from it fails with 403.
- **Dead tokens are detected and replaced.** Running the integration tests wipes
  the database; the next `demo:setup` notices the `.env` tokens no longer
  authenticate and mints new ones instead of failing mysteriously.
- **A busy API port stops the run.** Two servers can bind the same port on
  different interfaces, after which requests reach whichever one `localhost`
  resolves to — a failure that looks like the demo misbehaving. If `PORT` is
  taken, it says so and tells you to set `PORT=3010`. Every other URL is derived
  from `PORT`, so nothing else needs changing.

### Starting services individually

```bash
pnpm dev:api           # :3000 (or PORT)
pnpm dev:mcp           # :3100
pnpm dev:copilot       # :3200 backend + :5174 UI
pnpm dev:explorer      # :5173
```

The Copilot retries its capability check with backoff and recovers on its own
when the MCP server appears, so start order does not matter.

## Environment variables

All are read by the Copilot **server** only.

| Variable                 | Default                     | Purpose                                                    |
| ------------------------ | --------------------------- | ---------------------------------------------------------- |
| `ANTHROPIC_API_KEY`      | —                           | Model credential. Absent ⇒ setup screen.                   |
| `COPILOT_MODEL`          | `claude-opus-5`             | Model id                                                   |
| `COPILOT_EFFORT`         | `medium`                    | `low`–`max`; trades latency and tokens against depth       |
| `COPILOT_MAX_TOKENS`     | `16000`                     | Per-turn output ceiling (thinking + text)                  |
| `COPILOT_MAX_ITERATIONS` | `12`                        | Tool round-trips per user message; stops runaway loops     |
| `COPILOT_HOST` / `_PORT` | `0.0.0.0` / `3200`          | Backend bind address                                       |
| `MCP_SERVER_URL`         | `http://127.0.0.1:3100/mcp` | Triggers MCP endpoint                                      |
| `TRIGGERS_API_URL`       | `http://127.0.0.1:3000`     | REST base — activity SSE proxy only                        |
| `TRIGGERS_*_TOKEN`       | —                           | Forwarded to MCP as `X-Triggers-*-Token`; any subset works |
| `MCP_HTTP_AUTH_TOKEN`    | —                           | Bearer, when MCP runs in `shared` auth mode                |
| `EXPLORER_URL`           | `http://localhost:5173`     | Target for "Open in Explorer"                              |

## Example prompts

```
Create a GitHub subscription for pull request events.
Send a GitHub pull_request.opened event for repository acme/widgets.
What's waiting?
Check the inbox.
Acknowledge the current delivery.
Reject it and retry later.
Show me dead-letter deliveries.
Replay the failed delivery.
What's going on in the system?
```

## Demo script

Put the Copilot and the Explorer side by side, press **Present** to hide the
configuration chrome, then run:

| #   | Say                                                   | Tool                  | Explorer shows        |
| --- | ----------------------------------------------------- | --------------------- | --------------------- |
| 1   | "Create a GitHub pull request subscription."          | `create_subscription` | New subscription      |
| 2   | "Send a GitHub PR event for repository acme/widgets." | `ingest_event`        | Ingested → Pending    |
| 3   | "Check the inbox."                                    | `lease_deliveries`    | Pending → Leased      |
| 4   | "Acknowledge it."                                     | `ack_delivery`        | Leased → Acknowledged |
| 5   | "Show me any dead-letter deliveries."                 | `list_deliveries`     | —                     |
| 6   | "Replay the failed one."                              | `replay_delivery`     | Dead letter → Pending |

The **Try a demo** panel runs the same sequence by sending these prompts through
the normal execution path — the outcomes are whatever the platform really
returns, not a script.

## Agent behaviour

The system prompt is built from the discovered tool list, with three rules that
exist because of specific failure modes:

- **Read-only by default.** `lease_deliveries` mutates queue state — it hides the
  delivery from other consumers, increments the attempt count, and starts a
  visibility timeout. The agent is explicitly forbidden from leasing to _inspect_;
  "what's waiting?" routes to `list_deliveries` with `status=PENDING`.
- **No unearned claims.** The agent may not report success until a tool result
  confirms it, and must use ids from tool results rather than inventing them.
- **Ambiguity is surfaced, not guessed.** Conversation context adopts a target
  only when it is unambiguous. Three dead letters select nothing, which forces
  the agent to ask which one.

Destructive actions (`delete_subscription`, `reset_workspace`) are refused on
first attempt and surfaced as a confirmation card. Approving it authorises that
exact call — the approval is a fingerprint of the tool name plus its arguments,
so it cannot be reused for a different one. Routine demo mutations (publish,
lease, ACK, NACK, create subscription) run without an extra step.

## Security notes

- **Model and MCP credentials are server-side.** The browser bundle contains no
  token, nothing is written to `localStorage` or `sessionStorage`, and the
  capabilities endpoint is asserted in tests to return no credential.
- **Lease tokens are redacted before they leave the server.** The model receives
  the real token (it needs it to acknowledge); the copy streamed to the UI is
  masked. Redaction is server-side, so the secret never enters the browser at
  all rather than being hidden after arrival.
- **No HTML injection surface.** There is no `dangerouslySetInnerHTML` in the
  app. Model output and tool results — which can quote third-party event
  payloads — render as React text nodes, with light inline formatting built from
  elements rather than parsed markup.
- **Technical error detail is development-only.** Production error payloads carry
  the plain-language message and nothing else.
- **No `trg_` or `sk-ant-` values are committed.** Credentials live in the
  gitignored `.env`.

Verified by grep against the built output: the model key appears in neither
bundle, and the Copilot's browser bundle contains no Triggers token at all.

> **One caveat, inherited from the Explorer's design.** The Explorer is a static
> SPA that calls the API directly, so when `VITE_DEMO_*` is set at build time
> those tokens _are_ baked into its JavaScript bundle. That is what makes the
> local demo zero-setup, and `pnpm demo:setup` writes those variables. It is fine
> for a local demo; do not set them when building a publicly reachable Explorer.
> `render.yaml` deliberately does not. The Copilot has no equivalent exposure —
> its credentials never leave the server.

## Testing

```bash
pnpm --filter @triggers/copilot test
```

112 tests. The MCP boundary is deliberately **not** mocked: one suite boots the
real MCP server over the real Streamable HTTP transport and drives it with the
Copilot's actual client, verifying the handshake, tool discovery, role gating,
a live tool round-trip, resource reads, and lease-token masking. Only the
Triggers REST API beneath it is stubbed, so the tests need no database.

The remaining suites cover the agent tool loop (including confirmation gating,
refusals, cancellation, and the iteration ceiling), route behaviour and SSE
framing, conversation-context ambiguity, masking, and the UI.

## Known limitations

- **One conversation, in memory.** Reloading the page clears the transcript;
  there is no persistence layer.
- **No streaming tool progress.** A tool call reports running then settles; long
  operations show no intermediate progress.
- **Long polls block the turn.** `lease_deliveries` with a large `wait` holds the
  conversation open; the agent is instructed to use `wait=0` unless asked.
- **Explorer deep links are event-scoped.** The Explorer's Events page is
  event-centric, so a delivery link opens its parent event's detail drawer.
- **Single workspace.** The Copilot uses whichever workspace its configured
  tokens belong to; there is no tenant switcher.
- **The activity stream needs a read token.** With only a producer credential
  configured, the live feed is unavailable (the rest still works).
