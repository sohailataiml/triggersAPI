# TriggersAPI

A durable **event ingestion and delivery platform** — a Zapier-style backbone for
automations, agents, and external systems. Producers `POST` events; consumers pull
them from a lease-based **inbox** with visibility timeouts, ACK/NACK, exponential-backoff
retries, a dead-letter office with replay, and low-latency **long polling**. A React
**Explorer** streams every state transition live over SSE.

Built with Node.js + TypeScript, Fastify, Prisma/PostgreSQL, Redis, BullMQ, and Vite.

---

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/e14e47ba-08f1-4c6b-b36c-6dad4234fbd9" />


## Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick start (local dev)](#quick-start-local-dev)
- [Run with Docker Compose](#run-with-docker-compose)
- [Demo script](#demo-script)
- [API reference](#api-reference)
- [Reliability model](#reliability-model)
- [Tradeoffs & non-goals](#tradeoffs--non-goals)
- [Observability](#observability)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Configuration](#configuration)

---

## Architecture

```
Producers ──POST /v1/events──▶  Fastify API  ──tx──▶  PostgreSQL (source of truth)
                                   │  │                   ▲   events, deliveries,
                     wake-up pub   │  │  activity xadd    │   leases, ack receipts,
                                   ▼  ▼                   │   replay audits
                              Redis Pub/Sub  Redis Streams │
                                   │              │        │ lease (FOR UPDATE SKIP LOCKED)
                    long-poll wake │              │ SSE    │
                                   ▼              ▼        │
Consumers ◀─GET /v1/inbox (lease)──┘         Explorer UI ──┘
   │  ACK / NACK
   ▼
BullMQ worker ──every 5s──▶ recover expired leases → retry / dead-letter
```

- **PostgreSQL is authoritative** for all event and delivery state.
- **Redis is advisory only** — wake-ups (Pub/Sub), the Explorer stream (Redis Streams),
  BullMQ scheduling, and long-poll counters. A Redis outage never loses accepted events.
- **Deliveries are leased** with a row-locked `FOR UPDATE SKIP LOCKED` query, giving
  at-most-one active lease and at-least-once delivery.

See [`docs/architecture.md`](docs/architecture.md) for the full design and ADRs.

## Prerequisites

- **Node.js 22+**
- **pnpm 9** (`npm install -g pnpm@9`)
- **Docker + Docker Compose** (for PostgreSQL and Redis)

> **Local ports:** this project maps Postgres to host **5433** and Redis to **6380**
> (to avoid clashing with other local stacks). Override in `.env` if you like.

## Quick start (local dev)

```bash
# 1. Install and configure
pnpm install
cp .env.example .env

# 2. Start infrastructure (Postgres :5433, Redis :6380)
pnpm infra:up

# 3. Create the schema and generate the Prisma client
pnpm db:generate
pnpm db:deploy        # or: pnpm db:migrate  (dev)

# 4. Seed a workspace + demo subscription + API tokens (prints tokens)
pnpm db:seed

# 5. Run the API, worker, and Explorer together
pnpm dev
```

Then:

- API: <http://localhost:3000> — health at `/health/ready`, docs at `/docs`, metrics at `/metrics`
- Explorer: <http://localhost:5173> — paste the ADMIN + PRODUCER tokens from the seed output

Run services individually with `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:explorer`.

## Run with Docker Compose

Infrastructure only (recommended for development):

```bash
docker compose up -d postgres redis
```

Full stack (API + worker + Explorer + Postgres + Redis) via the `full` profile:

```bash
docker compose --profile full up --build
```

- API → <http://localhost:3000>
- Explorer → <http://localhost:5173> (nginx proxies `/v1` and `/metrics` to the API)

The API container runs `prisma migrate deploy` on startup. After the stack is up, seed it:

```bash
docker compose exec api pnpm db:seed
```

## Demo script

With the API + worker + Explorer running and the DB seeded:

1. Open the **Explorer** (<http://localhost:5173>) and paste the seeded ADMIN + PRODUCER tokens. The live stream shows **stream live**.
2. Start a consumer long-poll in a terminal (uses the seeded CONSUMER token + subscription id):
   ```bash
   curl "http://localhost:3000/v1/inbox?subscriptionId=<SUB_ID>&wait=30" \
     -H "Authorization: Bearer <CONSUMER_TOKEN>"
   ```
3. **Ingest** a GitHub-style event from the Explorer's _Ingest event_ panel (or via `curl` — see [API examples](docs/api-examples.md)). The long poll returns immediately (Redis wake-up).
4. Watch the Explorer: `INGESTED → CREATED → LEASED`.
5. **ACK** the delivery (see examples) → it turns `ACKNOWLEDGED` live.
6. Ingest another event, **lease it but don't ACK**. After the visibility timeout the worker (or the next inbox poll) **redelivers** it — attempt count increments.
7. **NACK** repeatedly (or set a subscription `maxAttempts: 1`) until it enters **DEAD_LETTER**.
8. In the Explorer, click **Retry Now** on the dead-letter row → it returns to `PENDING` and can be leased and ACKed again.
9. Repeat an ACK with the **same** `X-Consumer-Process-ID` → `duplicateAck: true` (idempotent).
10. Repeat ingestion with the **same** `Idempotency-Key` → `duplicate: true`, same `eventId`.
11. Watch `/metrics` counters change throughout.

## API reference

All routes are under `/v1`. Full OpenAPI at `/docs` and `/openapi.json`.
Success responses use `{ "data": ... }`; errors use `{ "error": { code, message, requestId } }`.

| Method & path                                     | Role           | Purpose                                                    |
| ------------------------------------------------- | -------------- | ---------------------------------------------------------- |
| `POST /v1/events`                                 | producer       | Ingest an event (`Idempotency-Key` header optional)        |
| `POST /v1/subscriptions`                          | admin          | Create a subscription (source/eventType/subject filters)   |
| `GET /v1/subscriptions`                           | admin/consumer | List subscriptions                                         |
| `PATCH /v1/subscriptions/:id`                     | admin          | Update a subscription                                      |
| `GET /v1/inbox`                                   | consumer       | Lease deliveries; `?wait=<s>` for long polling             |
| `POST /v1/deliveries/:id/ack`                     | consumer       | Acknowledge (idempotent per `X-Consumer-Process-ID`)       |
| `POST /v1/deliveries/:id/nack`                    | consumer       | Negative-ack → retry or dead-letter                        |
| `POST /v1/deliveries/:id/replay`                  | admin          | Replay a dead-letter delivery (`Idempotency-Key` optional) |
| `GET /v1/deliveries`                              | admin/consumer | List deliveries with filters                               |
| `GET /v1/deliveries/:id`                          | admin          | Delivery detail                                            |
| `GET /v1/explorer/overview`                       | admin/consumer | Aggregate counts                                           |
| `GET /v1/explorer/stream`                         | admin/consumer | SSE lifecycle stream                                       |
| `GET /health/live` · `/health/ready` · `/metrics` | —              | Ops endpoints                                              |

See [`docs/api-examples.md`](docs/api-examples.md) for `curl` and a TypeScript consumer loop.

## Reliability model

- **At-least-once delivery.** A consumer may see an event more than once (lease expiry,
  crash before ACK, lost ACK response, or admin replay). Consumers must process idempotently.
- **Leasing.** `SELECT … FOR UPDATE SKIP LOCKED` inside a transaction guarantees at-most-one
  active lease per delivery; concurrent consumers never receive the same row.
- **Idempotent ACK.** A unique `(delivery_id, consumer_process_id)` receipt makes a repeated
  ACK from the same process return the original success (`duplicateAck: true`).
- **Retry & dead-letter.** NACK or lease expiry schedules an exponential backoff
  (5s → 15s → 45s → 2m → 5m, with bounded jitter); once `maxAttempts` is reached the delivery
  is dead-lettered. Replay is admin-only, audited, and idempotent.
- **Two recovery layers.** The BullMQ worker scans for expired leases every 5s; the inbox
  lease query _also_ recovers overdue leases defensively, so redelivery works even if the
  worker is down.
- **Producer idempotency.** A partial unique index on `(workspace_id, idempotency_key)`
  returns the original event for duplicate ingests.

## Tradeoffs & non-goals

- **Not exactly-once.** Cannot be guaranteed across arbitrary downstream systems without a
  shared transaction boundary; the platform provides the primitives for _effectively-once_
  handling (stable IDs, lease tokens, idempotent ACK, replay audit).
- **Synchronous fan-out.** Delivery rows are created in the ingest transaction. The public
  contract is unchanged if fan-out later becomes asynchronous at scale.
- **Redis is advisory.** Lost Pub/Sub messages only delay delivery until the long poll times
  out and the next DB query finds the event.
- **Prototype scope:** exact-match filters only; single region; bearer API keys (hashed).

## Observability

- **Metrics** (`/metrics`, Prometheus): events ingested/duplicate; deliveries
  created/leased/acknowledged/nacked/retried/dead-lettered/replayed; active-leases &
  pending gauges; long-poll active gauge & wait histogram; ingestion / ACK / end-to-end
  latency histograms.
- **Structured logs** (Pino) with a per-request correlation id (`req_…`, honoring an inbound
  `X-Request-Id`); Authorization headers, lease tokens, and payloads are redacted.

## Testing

```bash
pnpm test              # unit tests (domain) + package tests
pnpm test:integration  # API integration tests against real Postgres + Redis
pnpm typecheck
pnpm lint
```

Integration tests use the **real** Postgres/Redis containers (no mocking of reliability
behavior) and cover ingestion, matching, idempotency, transactional leasing, lease
ownership/expiry, ACK/NACK, backoff, dead-letter, replay, **concurrency (no double-lease)**,
long-poll wake/timeout, and the Explorer views.

## Project structure

```
apps/
  api/       Fastify API (routes, services, plugins)
  worker/    BullMQ maintenance worker (expired-lease recovery)
  explorer/  React + Vite Explorer UI (SSE)
packages/
  config/          Zod-validated environment
  contracts/       Zod schemas, error envelope, typed errors
  database/        Prisma client + UUIDv7 helpers
  domain/          pure logic: matching, backoff, crypto, transitions
  observability/   Pino logger + prom-client metrics
  test-utils/      DB reset + key seeding for integration tests
prisma/            schema, migrations, seed
```

## Configuration

Environment variables (validated at startup — see `.env.example`):

| Variable                             | Default                 | Purpose                           |
| ------------------------------------ | ----------------------- | --------------------------------- |
| `PORT`                               | `3000`                  | API port                          |
| `DATABASE_URL`                       | —                       | PostgreSQL connection string      |
| `REDIS_URL`                          | —                       | Redis connection string           |
| `API_KEY_PEPPER`                     | —                       | HMAC pepper for API-key secrets   |
| `LEASE_TOKEN_SECRET`                 | —                       | HMAC secret for lease tokens      |
| `MAX_EVENT_BYTES`                    | `262144`                | Ingest body-size limit            |
| `MAX_LONG_POLL_SECONDS`              | `30`                    | Long-poll `wait` clamp            |
| `DEFAULT_VISIBILITY_TIMEOUT_SECONDS` | `60`                    | Default lease duration            |
| `DEFAULT_MAX_ATTEMPTS`               | `5`                     | Default retry ceiling             |
| `MAX_ACTIVE_LONG_POLLS_PER_KEY`      | `50`                    | Long-poll concurrency cap per key |
| `EXPLORER_STREAM_MAX_LENGTH`         | `1000`                  | Redis activity stream trim length |
| `CORS_ORIGINS`                       | `http://localhost:5173` | Allowed origins                   |

> **Windows/OneDrive note:** keep this repo **outside** OneDrive (or exclude `node_modules`
> from sync). OneDrive's Files-On-Demand can dehydrate `node_modules` into cloud placeholders
> that Node cannot read (`EBADF`), breaking `tsc`/`vitest`.
