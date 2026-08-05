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
