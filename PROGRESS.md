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
