# TriggersAPI — Build Progress

Living log of what has been implemented, phase by phase.

## Environment notes (this machine)

- Node v24.15.0, Docker 29.6.1 + Compose v5.2.0.
- pnpm 9.15.0 installed via `npm i -g pnpm` (corepack blocked by Program Files permissions).
- **Local host ports:** Postgres `5433`, Redis `6380` (5432/6379 already in use by another stack).

---

## Phase 1 — Repository assessment ✅

- Assessed toolchain and existing (Express) scaffold; superseded it with the required Fastify + pnpm monorepo.
- Produced phased plan, assumptions, and first vertical slice.

## Phase 2 — Foundation ✅

Created:

- Root workspace: `pnpm-workspace.yaml`, `package.json`, `.npmrc`, `tsconfig.base.json`, ESLint 9 flat config, Prettier, `.gitignore`, `.env(.example)`, `docker-compose.yml`.
- `packages/config` — Zod-validated env (fail-fast).
- `packages/contracts` — Zod request/response schemas, error codes, typed `AppError` classes + envelope.
- `packages/database` — Prisma client factory, UUIDv7 `newId()`, generated-client re-exports.
- `packages/domain` — filter matching, exponential backoff+jitter, lease/API-key crypto, state transitions (with unit tests).
- `packages/observability` — Pino logger (with redaction) + prom-client metrics set.
- `apps/api` — Fastify app: zod type provider, CORS/Helmet, error envelope, Swagger/OpenAPI, health/ready/metrics, auth service, activity service.
- `apps/worker` — bootstrap skeleton (jobs land in Phase 4).
- `prisma/schema.prisma` — Workspace, ApiKey, Event, Subscription, Delivery, AckReceipt, ReplayAudit + indexes.

Verified:

- `pnpm install` (9 projects), `pnpm db:generate`, migration `20260805174754_init` applied (incl. partial idempotency unique index).
- `pnpm typecheck` ✅ (8 projects), `pnpm lint` ✅, `pnpm test` ✅ (domain: 14 unit tests).
- API boots against live PG (5433) + Redis (6380): `/health/live` ok, `/health/ready` reports `postgres: ok, redis: ok`, `/metrics` serves Prometheus text, `/docs` + `/openapi.json` serve the OpenAPI spec, error envelope confirmed.

## Phase 3 — First vertical slice ✅

Created:

- Services: `SubscriptionService`, `EventIngestionService` (transactional event + delivery fan-out, idempotency, post-commit wake-ups/activity), `DeliveryService` (`FOR UPDATE SKIP LOCKED` lease + overdue-lease recovery; idempotent ACK via ack receipts).
- Routes (`/v1`): `POST /events`, `POST/GET/PATCH /subscriptions`, `GET /inbox`, `POST /deliveries/:id/ack`. Role-scoped auth (producer/consumer/admin).
- Success envelope `{ data }` alongside error envelope `{ error }` (contracts `dataEnvelope`).
- `prisma/seed.ts` (workspace + demo subscription + tokens), integration test harness (`buildTestApp`, `resetDatabase`, `seedWorkspaceAndKeys`).

Verified:

- **Integration tests: 11 passing** against real PG/Redis — full slice (subscribe→ingest→lease→ack→ACKNOWLEDGED in PG), non-matching subscription, ingest validation/authz, idempotent ingest, idempotent ACK (same process id), cross-process ACK returns current state, invalid lease token → 409 LEASE_CONFLICT, missing process-id header → 400.
- Live curl smoke: ingest 201, lease, ACK, idempotent repeat ACK (`duplicateAck: true`), metrics increment.
- `pnpm typecheck` ✅, `pnpm lint` ✅, unit tests ✅.

**Design decision:** all success responses use a `{ data: ... }` envelope (matching the task's "API expectations" example and mirroring the `{ error: ... }` envelope) — the architecture doc's flat examples are wrapped consistently.

## Phase 4 — Reliability ✅

Created:

- `DeliveryService.nack` (validate lease → exponential backoff retry or dead-letter), `recoverExpiredLeases`, shared `applyFailure` transition.
- `ReplayService` (admin dead-letter → PENDING, row-locked, audit record, idempotent via Idempotency-Key), `DeliveryReadService` (delivery detail).
- Routes: `POST /deliveries/:id/nack`, `POST /deliveries/:id/replay`, `GET /deliveries/:id`.
- Worker: BullMQ `triggers-maintenance` queue + repeatable `recover-expired-leases` scheduler (5s), sharing the retry policy (`decideRetryOutcome`, `computeRetryDelayMs`) with the API.
- `/metrics` now refreshes `active_leases` / `pending_deliveries` gauges from the DB (authoritative across API + worker).

Verified:

- **Integration tests: 19 passing** (added reliability + concurrency). Covers NACK→retry (backoff, availableAt in future), attempts-exhausted→dead-letter, replay→PENDING+audit, replay of non-dead-letter→409, idempotent replay, lease-expiry redelivery, **two concurrent consumers never double-lease** (single + N-event fan-out with zero overlap).
- Worker boots and runs the scheduled recovery job with no errors.
- `pnpm typecheck` ✅, `pnpm lint` ✅.

### ⚠️ Environment note — OneDrive vs. node_modules

Mid-build, OneDrive "Files On-Demand" dehydrated `node_modules` into cloud placeholders; Node's `readFileSync` fails on those (`EBADF`/`UNKNOWN`), breaking `tsc`/`vitest`. Fix applied: **stopped the OneDrive process and reinstalled `node_modules` fresh** (real local files). OneDrive is left stopped for the remainder of the build. **Recommendation:** move this repo outside OneDrive (e.g. `C:\dev\TriggersAPI`) or exclude `node_modules` from OneDrive sync — otherwise placeholders will recur. Restart OneDrive when done.

## Phase 5 — Real-time long polling ✅

Created:

- `LongPollService` implementing **query → subscribe → query → wait → query** with per-subscription Redis Pub/Sub wake-ups. The second query closes the missed-wake-up race. Includes: max-wait clamp (`MAX_LONG_POLL_SECONDS`), per-API-key active-poll limit (Redis counter with TTL), client-disconnect abort (`AbortController` on `request.raw` close), and **Redis-down fallback to periodic DB polling**.
- Metrics wired: `triggers_long_poll_active` gauge, `triggers_long_poll_wait_seconds` histogram.
- Inbox route now honours `?wait=<seconds>`.

Verified:

- **Integration tests: 23 passing** (added 4 long-poll). Immediate availability (<2s), **wake-after-ingest via Pub/Sub (~0.7s, well under the 15s wait)**, timeout returns empty at ~2s, active-poll gauge returns to 0 after completion.
- `pnpm typecheck` ✅, `pnpm lint` ✅.

## Phase 6 — Explorer UI + SSE ✅

Created:

- API: `GET /v1/explorer/stream` (SSE via Redis Streams `XREAD BLOCK`, `Last-Event-ID`, heartbeats, disconnect cleanup), `GET /v1/explorer/overview` (aggregate counts), `GET /v1/deliveries` (filtered list). Query-token auth for EventSource.
- `apps/explorer` React/Vite app: connection settings (localStorage), overview stat cards, **live SSE activity stream**, ingest form, subscription create/list, deliveries table with status badges + source/status/subscription filters, delivery detail drawer, **Retry Now** on dead-letter rows (calls replay). Dark "control-room" theme.

Verified:

- **Integration tests: 25 passing** (added explorer overview + list).
- **Live browser verification**: loaded Explorer, connected with seeded tokens (SSE "stream live"), seeded subscription rendered, **ingested an event via the UI → PENDING delivery appeared in the table and INGESTED/CREATED streamed live over SSE**, overview updated (1 event / 1 pending).
- Explorer `typecheck` ✅, `vite build` ✅ (50 KB gzip), `pnpm lint` ✅.

## Phase 7 — Observability & documentation ✅

Created:

- **Docker**: `apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/explorer/Dockerfile`
  (multi-stage → nginx), `apps/explorer/nginx.conf` (SPA + `/v1` & `/metrics` proxy, SSE-safe),
  `.dockerignore`. Compose `full` profile wires all five services.
- **Docs**: comprehensive `README.md` (setup, Docker, demo script, API reference, reliability
  model, tradeoffs, config), `docs/architecture.md` (summary + ADRs), `docs/api-examples.md`
  (curl + TypeScript consumer loop).
- Metrics/observability confirmed complete (all required counters, gauges, latency histograms;
  Pino structured logs with `req_…` correlation ids and secret/payload redaction).

Verified:

- **Full stack via `docker compose --profile full up --build`**: postgres + redis + **api +
  worker + explorer** all start; API runs `prisma migrate deploy` then serves; `/health/ready`
  → postgres+redis ok; `/metrics` served; Explorer (nginx) serves and proxies `/v1` to the API.
- Final gate: `pnpm typecheck` ✅ (9 projects), `pnpm lint` ✅, `pnpm format` ✅,
  **unit tests (14) + integration tests (25) = 39 passing**.

---

## Summary — Definition of Done

All completion criteria met: starts via Docker Compose; migrations run; API/worker/Redis/
Postgres/Explorer start locally; end-to-end delivery flow works; retries + dead-letter replay
work; long polling works; Explorer receives live SSE updates; tests + typecheck + lint pass;
OpenAPI available at `/docs`; README has exact setup + demo instructions.

---

## Explorer redesign — Live event operations console ✅ (Dashboard-first pass)

Redesigned the Explorer from an admin-table dashboard into a polished, live event-operations
console (Stripe/Linear-restrained dark theme) that tells the reliability story at a glance:
**ingest → store → match → pending → lease → ack → (retry → dead-letter → replay)**.

### Stack added (Explorer)

- **Tailwind CSS** (token-driven, 7-stage status system) · **TanStack Query** (server state +
  SSE-driven invalidation + reconnect reconciliation) · **framer-motion** (pipeline token motion,
  reduced-motion safe) · **lucide-react** (icons) · **zustand** (SSE activity store, dedup by
  stream id) · **Vitest + Testing Library** (14 Explorer tests).

### New architecture

- `lib/` status system, formatters, source/preset metadata.
- `store/eventStore.ts` — single SSE source of truth, dedup by Redis stream id, bounded.
- `useSSE.ts` — extended to feed the store, fire debounced refetch on fresh frames, and
  reconcile from REST on reconnect (Postgres stays authoritative).
- `app/apiContext` + `hooks/queries` — typed query layer over the existing `ApiClient`.
- `components/{layout,dashboard,events,shared}` + `pages/{Dashboard,Pipeline,Events,System}`.
- 4-section shell: **Dashboard** (KPIs, live pipeline, composer, consumer simulator,
  dead-letter recovery, humanized activity), **Pipeline**, **Events** (new endpoint), **System**
  (real `/health/ready`).

### Backend (one small, approved read-only addition)

- **`GET /v1/events`** (admin/consumer) — event-centric list with a per-status delivery rollup,
  filters (`source`/`eventType`/`status`/`search`/`limit`). New `deliveryReads.listEvents`,
  contract `eventListItem`/`eventListQuery`. No other backend changes.

### Data honesty

- No fabricated trends/charts — the platform keeps no metrics history; success rate is derived
  from real terminal counts, and the System page states point-in-time limits explicitly.

### Verified

- `pnpm --filter @triggers/explorer typecheck` ✅ · `build` ✅ (119 KB gzip JS, 5.5 KB CSS) ·
  `test` ✅ (14) · API `typecheck` ✅ · root `lint`/`format` ✅.
- Live: API restarted on :3010, Vite on :5173. Dashboard renders with live data; `GET /v1/events`
  returns correct rollups through the Vite proxy; **zero browser console errors** (fixed a pnpm
  duplicate-React dev issue via `resolve.dedupe`). Ingest → overview → Events all confirmed.

### Deferred to the expand pass

Pipeline "demo mode" + attempt timelines, subscription create/manage drawer, Recharts (needs a
metrics history store), optional MCP chat.

---

## Explorer expansion — Demo mode, subscriptions, attempts, guided scenarios ✅

Second Explorer pass, prioritizing demo value. All working behavior + the 14 prior tests preserved.

### 1. Pipeline Demo Mode

- Full-screen presentation overlay (`components/pipeline/DemoMode.tsx`) with an enlarged pipeline
  (`LivePipeline` gained `size`/`showHeader` props), a recent-event selector, and a focus panel
  (`EventFocusCard`) showing source, event type, short id, status, **live lease + retry
  countdowns**, delivery target (Pull inbox → subscription), attempt count, and the attempt
  timeline. Esc to exit; secondary chrome hidden; reduced-motion respected. Real REST+SSE only.

### 2. Subscription management

- `SubscriptionFormDrawer` (create/edit: name, source/eventType filters, delivery mode = Pull
  inbox, visibility timeout, max attempts) + `SubscriptionCard` (active toggle, filters, mode,
  pending count, latest delivery — rollups derived client-side) + `SubscriptionsPanel`, homed on
  the Events page. Broadened `api.createSubscription`/`updateSubscription` + TanStack mutations.
  Tenant isolation + Zod validation unchanged; no secrets exposed.

### 3. Delivery attempt timeline

- `DeliveryAttemptTimeline` reconstructs each lease/ACK/NACK/retry/dead-letter/replay from the SSE
  feed (attempt #, timestamps, duration, failure reason) and appends a live tail (current lease
  or next-retry countdown) from the delivery snapshot. Surfaced as an **Attempts** tab in the
  detail drawer and inside the demo focus panel. Invents nothing beyond backend data.

### 4. Guided demo scenarios

- `DemoRunner` + `scenarios.ts`: A) successful delivery, B) consumer crash & redelivery (3s
  visibility timeout → expiry → re-lease → ACK), C) dead-letter & replay. Every step drives the
  real backend and narrates from actual responses — no hard-coded final states. Scenario C
  restores the subscription's `maxAttempts` in a `finally` (cleanup).

### 5. Security

- Settings tokens are masked (password inputs + per-field reveal toggle + `saved · …abcd` tail);
  added a visible "demo credentials — keep out of source control" warning. No credential logging.
- Verified: no `trg_` tokens in tracked files or branch git history; no hardcoded secrets in
  `apps/explorer/src`.

### Verified

- `pnpm --filter @triggers/explorer typecheck` ✅ · Explorer tests (24 total: 14 prior + 10 new
  covering scenario transitions, subscription create/filter, attempt timeline, demo focus) ·
  `build` ✅ · manual 3-scenario run in-browser · zero console errors.

### Still deferred

Recharts (no metrics-history store), webhook push delivery mode.

---

## MCP server — `apps/mcp` ✅

Exposes the platform to AI agents over the Model Context Protocol. A thin client
of `/v1` (not a second DB consumer), so API-key auth, role checks, idempotency,
and metrics all stay in force.

- **14 tools**, role-gated from the configured tokens: `ingest_event` (producer);
  `lease_deliveries`/`ack_delivery`/`nack_delivery` (consumer); `replay_delivery`,
  `get_delivery`, subscription CRUD (admin); plus the read tools. `reset_workspace`
  is destructive and off unless `TRIGGERS_MCP_ENABLE_RESET=true`.
- **3 resources**: `triggers://overview`, `triggers://subscriptions`,
  `triggers://deliveries/dead-letter`.
- **Both transports**: stdio (local clients) and Streamable HTTP (hosted), sharing
  one server core. HTTP defaults to `header` auth — each session supplies its own
  Triggers keys, so the process stores no credentials.
- Tool input **and** output schemas come from `@triggers/contracts`, so drift
  between the MCP surface and the API fails a test.
- Errors return as `isError` results carrying the API's error code plus a
  recovery hint (`LEASE_EXPIRED` → "re-lease, don't reuse the token").

**Verified:** 77 tests, including two genuine integration suites (a live socket

- real MCP client over Streamable HTTP; a spawned stdio child process proving
  logs go to stderr rather than corrupting the protocol). Live run against the
  real stack exercised ingest → lease → ack, ACK idempotency, producer
  idempotency, nack → dead-letter, admin replay, and error surfacing.

**One bug found and fixed:** the server advertised a `resources` capability
unconditionally while only registering resources for admin/consumer keys, so a
producer-only session claimed the capability then returned `Method not found`.

`packages/observability` gained an additive `toStderr` logger option (stdio
transports must not write to stdout).

---

## Zapier AI Automation Copilot — `apps/copilot` ✅

An AI client that operates the platform in natural language. **A consumer of the
MCP server, not a second control plane** — every mutation is a real MCP tool
call, and the Explorer shows the same state move live.

### Architecture

```
Browser (:5174) → Copilot backend (:3200) → MCP client → MCP server (:3100)
   → /v1 REST (:3000) → PostgreSQL + Redis + BullMQ → Explorer SSE (:5173)
```

Standalone app (chosen over an Explorer section) with its own Fastify backend
and Vite frontend. Reuses `@triggers/contracts` for types; mirrors the Explorer's
token-driven Tailwind theme so the two surfaces read as one product.

### Capabilities are discovered, never assumed

`tools/list` + `resources/list` on connect; JSON Schemas convert straight into
Claude tool definitions, and the system prompt is built from what came back. A
producer-only credential registers only `ingest_event` — the capability strip
strikes through Consumer and Admin, those suggested prompts disappear, and the
agent is told plainly it cannot perform them.

### Agent runtime

`claude-opus-5`, adaptive thinking, `effort: medium`, streaming, with a **manual
tool loop** rather than the SDK tool runner — the UI needs each tool call
surfaced as it starts and again when it settles, interleaved with text deltas.
Handles `refusal`, `pause_turn`, cancellation, and a hard iteration ceiling.

### Three findings from live testing, all fixed

1. **Fabricated lease tokens (the significant one).** Rather than copying the
   64-char token from the lease result, the model invented `lt_0…`; the platform
   rejected the ACK with `LEASE_CONFLICT` and the delivery was stranded until its
   visibility timeout. Reproduced in 12s, so not expiry. **Fix is custody, not
   prompting:** `LeaseRegistry` records the token server-side, redacts it from
   the model's context, and substitutes the real value on ack/nack. The token now
   reaches neither the browser nor the model.
2. **Stale state answers.** "What's going on?" was answered by arithmetic over
   earlier turns — it reported 5 events / 3 acknowledged when the database had
   4 / 1. Prompt now requires a fresh tool call for any current-state question.
3. **Interactive leases expiring.** A 60s visibility timeout is shorter than a
   human-paced exchange; the agent now leases with `visibilityTimeout=300`.

### Security

Model key and Triggers tokens live only in the Copilot server's environment.
Lease tokens are masked server-side before streaming to the UI. No
`dangerouslySetInnerHTML` anywhere — model output and tool results render as
React text nodes, so HTML injection is structurally impossible. Technical error
detail is development-only. Asserted in tests: nothing in `localStorage`, no
token in the DOM, no credential in the capabilities payload; verified by grep:
no `trg_`/`sk-ant-` in the built bundles or tracked files.

### Verified

- 129 Copilot tests. The MCP boundary is **not** mocked — one suite boots the
  real MCP server over the real Streamable HTTP transport and drives it with the
  Copilot's own client (handshake, discovery, role gating, tool round-trip,
  resource reads, masking).
- **Live end-to-end against the real stack with a real LLM**, all assertions
  passing: subscription check → `ingest_event` → `list_deliveries` (crucially
  _not_ leasing to inspect) → `lease_deliveries` → `ack_delivery` →
  `get_overview`, whose reported counts matched `/v1/explorer/overview` exactly.
- **In-browser**: UI renders, MCP connected, all three roles, live activity
  streaming; a suggested prompt produced a real `ingest_event` tool card
  (Succeeded, 113ms) and the activity feed showed `event.ingested` /
  `delivery.created` seconds later. Zero console errors.
- Repo gate green: `pnpm format`, `lint`, `typecheck` (11 projects), `test`
  (Explorer 24 · domain 14 · MCP 77 · Copilot 129), `build`.

Explorer got one small additive change: `?section=` / `?event=` deep links, so
"Open in Explorer" lands on the item. Its 24 tests still pass.

### Known limitations

One in-memory conversation (no persistence); no intermediate progress for
long-running tools; Explorer deep links are event-scoped; single workspace.

---

## Zero-setup demo — `pnpm demo` ✅

A grader should not have to copy a token or start five terminals. One command
now brings the whole stack up already connected.

- **`pnpm demo`** = `demo:up` (compose `--wait` + `migrate deploy`) →
  `demo:setup` → `demo:run` (all five services under `concurrently -k`).
- **`prisma/demo-setup.ts`** is idempotent and converging: it finds-or-creates
  the demo workspace and subscription, **validates the tokens already in `.env`
  against the database** and reuses them, minting only what is missing, then
  writes everything back — including the `VITE_DEMO_*` values the Explorer uses
  to auto-connect. `db:seed` is left untouched (it always mints fresh, which is
  right for a first run and wrong for a restartable demo).
- The **consumer key is minted unscoped**. `db:seed` scopes it to the seeded
  subscription, so leasing from a subscription the agent creates itself fails
  with 403 — the exact failure hit during Copilot verification.
- **Vite `envDir` now points at the repo root** for both the Explorer and the
  Copilot, so one `.env` drives everything. Verified by grep that Vite still
  injects only `VITE_`-prefixed vars: the model key is in neither bundle, and
  the Copilot's browser bundle carries no Triggers token at all.
- Removed the Copilot's dead `/v1` Vite proxy — its frontend only ever calls
  `/copilot/*`, which is the architectural claim made in the docs.
- **`useCapabilities`** replaces the one-shot capability check: backoff retry,
  then a slow poll, recovering on its own when MCP appears. Start order no
  longer matters, and a startup race shows "Connecting…" rather than a setup
  screen a reload would have fixed. A missing model key still surfaces
  immediately — no retry creates an environment variable.
- **Port-conflict guard.** A busy API port halts the run with instructions,
  because two servers binding the same port on different interfaces sends
  requests to whichever one `localhost` resolves to — a failure that reads as
  the demo misbehaving. Probes by connecting, not binding: on Windows
  SO_REUSEADDR makes a bind test report a busy port as free.

**Verified:** `pnpm demo` brought the stack from cold to fully connected in
~16-20s; `demo:setup` run three times reused the same workspace and tokens
(2 workspaces before and after, identical token); the guard correctly halted on
this machine's occupied :3000; both UIs load already connected — Explorer shows
"Stream live" with its preloaded-credentials banner and no Settings prompt,
Copilot shows MCP connected with all three roles and 14 tools.

**Caveat, inherited from the Explorer's design:** it is a static SPA that calls
the API directly, so `VITE_DEMO_*` tokens _are_ baked into its bundle when set
at build time. Fine locally, which is the point; `render.yaml` deliberately does
not set them for the deployed Explorer.
