# TriggersAPI — Architecture summary

This is a condensed design summary. See the root [`README.md`](../README.md) for setup and
the [reliability model](../README.md#reliability-model).

## Components

| Component                         | Responsibility                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Fastify API** (`apps/api`)      | Auth, validation (Zod), ingestion, leasing, ACK/NACK/replay, long polling, SSE, metrics. Stateless — scales horizontally. |
| **PostgreSQL**                    | Source of truth: workspaces, API keys, events, subscriptions, deliveries, leases, ACK receipts, replay audits.            |
| **Redis**                         | Advisory only: Pub/Sub wake-ups, Explorer activity (Redis Streams), BullMQ scheduling, long-poll counters.                |
| **BullMQ worker** (`apps/worker`) | Repeatable job (every 5s) recovering expired leases → retry/dead-letter.                                                  |
| **Explorer** (`apps/explorer`)    | React/Vite UI: overview, live SSE stream, ingest, subscriptions, deliveries, Retry Now.                                   |

## Domain model

`Workspace` → `ApiKey` (producer/consumer/admin, HMAC-hashed) · `Event` · `Subscription`
(source/eventType/subject filters, `maxAttempts`, `visibilityTimeout`) · `Delivery`
(status `PENDING|LEASED|RETRY_SCHEDULED|ACKNOWLEDGED|DEAD_LETTER`, attempt/lease/error fields)
· `AckReceipt` (unique per `delivery_id + consumer_process_id`) · `ReplayAudit`.

Key indexes: partial unique `(workspaceId, idempotencyKey)`; `Delivery(subscriptionId, status,
availableAt)` for inbox; `Delivery(status, leaseUntil)` for expiry recovery; unique
`Delivery(eventId, subscriptionId)`.

## Event lifecycle

```
POST /v1/events → INGESTED → PENDING
  GET /v1/inbox (lease) → LEASED
    ACK → ACKNOWLEDGED
    NACK / timeout → RETRY_SCHEDULED → (available) → PENDING → …
                       └ attempts exhausted → DEAD_LETTER → (admin replay) → PENDING
```

## Leasing (the core primitive)

Inside a transaction:

```sql
SELECT id FROM "deliveries"
WHERE "subscriptionId" = $1
  AND ( ("status" IN ('PENDING','RETRY_SCHEDULED') AND "availableAt" <= NOW())
        OR ("status" = 'LEASED' AND "leaseUntil" <= NOW()) )   -- defensive recovery
ORDER BY "availableAt", id
FOR UPDATE SKIP LOCKED
LIMIT $2;
```

Selected rows are updated to `LEASED` with an incremented attempt, a new `leaseUntil`, and a
hashed lease token (plaintext returned once, never stored). `SKIP LOCKED` guarantees two
consumers never lease the same row.

## Long polling

`query → subscribe → query → wait → query`. The second query (after subscribing to
`triggers:wakeup:<subscriptionId>`) closes the race where an event is inserted between the
first query and an active subscription. Falls back to periodic DB polling if Redis is down.

## Key decisions (ADRs)

- **ADR-001 At-least-once** — implementable across arbitrary consumers; idempotency primitives
  reduce duplicate processing.
- **ADR-002 PostgreSQL as source of truth** — durability, transactions, auditable transitions.
- **ADR-003 Redis for coordination, not durability** — fast wake-ups/jobs/streaming without
  risking event loss.
- **ADR-004 Lease-based pull delivery** — supports offline consumers and agents without public
  webhook URLs.
- **ADR-005 SSE for the Explorer** — one-way updates, simpler than WebSockets.
- **ADR-006 Fastify + TypeScript** — performance, schema-driven APIs, testability.
