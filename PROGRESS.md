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
