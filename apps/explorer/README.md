# TriggersAPI Explorer

A live event-operations console for TriggersAPI. It shows events flowing through the delivery
pipeline in real time — **ingest → store → match → pending → lease → acknowledge**, with the
reliability branches **retry**, **dead-letter**, and **replay**.

The design goal: a judge should understand the product in ~10 seconds without a technical
explanation.

## Run it

```bash
# 1. Bring up Postgres + Redis and seed tokens (from repo root)
pnpm infra:up
pnpm db:seed          # prints ADMIN / PRODUCER / CONSUMER tokens

# 2. Start the API (default :3000) and the Explorer
pnpm --filter @triggers/api dev
pnpm --filter @triggers/explorer dev   # http://localhost:5173
```

Open http://localhost:5173, click **Settings**, and paste the ADMIN + PRODUCER (+ CONSUMER)
tokens. Leave **API base** blank — Vite proxies `/v1` and `/metrics` to the API.

> If the API runs on a non-default port, point the proxy at it:
> `VITE_API_PROXY=http://127.0.0.1:3010 pnpm --filter @triggers/explorer dev`

## Sections

| Section       | What it shows                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard** | KPI cards, the live event pipeline, event composer, consumer simulator, dead-letter recovery, and a humanized activity feed. |
| **Pipeline**  | The enlarged real-time pipeline + status legend.                                                                             |
| **Events**    | Event-centric list (`GET /v1/events`) with per-status delivery rollups and filters.                                          |
| **System**    | Real service health from `/health/ready` (API, Postgres, Redis, SSE) + live counts.                                          |

## Architecture

- **Server state** — TanStack Query over the typed `ApiClient` (`src/api.ts`). Postgres is
  authoritative; the UI never optimistically marks a delivery complete.
- **Live layer** — `useSSE` subscribes to `GET /v1/explorer/stream` (EventSource, query-token
  auth). Frames are **deduped by their Redis stream id** in a zustand store (`store/eventStore.ts`),
  then drive a debounced query refetch. On reconnect the UI **reconciles from REST** rather than
  trusting the stream.
- **Pipeline projection** — `hooks/useRecentEvents` folds the activity feed into per-event tokens
  with a current stage. framer-motion animates token movement via a shared `layoutId`; everything
  remains readable with motion disabled (`prefers-reduced-motion`).
- **Design system** — Tailwind with CSS-variable tokens (`src/styles.css`) and a canonical
  7-stage status system (`src/lib/status.ts`): ingested·blue, pending·cyan, leased·amber,
  ack·green, retry·orange, dead·red, replay·purple. Status is never conveyed by color alone.

## Demo scenarios (all backed by real API calls)

1. **Successful pull delivery** — composer → _GitHub pull request opened_ → Send. Watch it enter
   the pipeline. In the consumer simulator: _Start long-poll_ → lease → **ACK**.
2. **Consumer crash / redelivery** — lease an event → **Simulate crash** → watch the lease
   countdown expire → lease again and ACK.
3. **Dead-letter recovery** — _Dead-letter recovery_ → **Dead-letter demo** (forces a failure) →
   **Replay** → the event returns to pending and completes.

## Tests

```bash
pnpm --filter @triggers/explorer test        # Vitest + Testing Library
pnpm --filter @triggers/explorer typecheck
pnpm --filter @triggers/explorer build
```

Covered: JSON-validation + ingest in the composer, KPI rendering + derived success rate, SSE
dedup and pipeline stage projection, and the formatting helpers.

## Known limitations

- **No historical time-series** — the platform keeps point-in-time counts only, so there are no
  trend arrows or charts. Prometheus scrapes `/metrics` for history.
- **Dashboard-first pass** — subscription create/manage drawer, pipeline "demo mode" + attempt
  timelines, and the optional MCP chat are deferred to the expand pass.
