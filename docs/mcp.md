# TriggersAPI — MCP server

`apps/mcp` exposes the Triggers platform to AI agents over the
[Model Context Protocol](https://modelcontextprotocol.io). An agent can publish
events, lease work from a subscription inbox, acknowledge or negatively
acknowledge it, and triage the dead-letter queue — the same contract a
hand-written consumer uses.

The server is a thin client of the `/v1` HTTP API rather than a second database
consumer. That keeps API-key authentication, role checks, idempotency, rate
limits, and metrics in force, and lets one MCP process point at a local dev
stack or a deployment without code changes.

Tool input and output schemas are the Zod schemas from `@triggers/contracts` —
the same ones the API validates with — so the tool surface cannot drift from the
API without a test failing.

---

## Contents

- [Tools](#tools)
- [Resources](#resources)
- [Roles and credentials](#roles-and-credentials)
- [Transports](#transports)
- [Connecting a client](#connecting-a-client)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing](#testing)

## Tools

Tools are registered only when a key for their role is configured, so a
producer-only setup never advertises admin tools.

| Tool                  | Role           | Purpose                                                    |
| --------------------- | -------------- | ---------------------------------------------------------- |
| `ingest_event`        | producer       | Publish an event; optional `idempotencyKey`                |
| `lease_deliveries`    | consumer       | Lease work from a subscription; `wait` long-polls          |
| `ack_delivery`        | consumer       | Settle a delivery as processed (idempotent per process id) |
| `nack_delivery`       | consumer       | Report failure → backoff retry or dead-letter              |
| `list_events`         | admin/consumer | Events with a per-status delivery rollup                   |
| `list_deliveries`     | admin/consumer | Deliveries filtered by status, subscription, source        |
| `get_delivery`        | admin          | Full delivery detail                                       |
| `replay_delivery`     | admin          | Return a dead-lettered delivery to `PENDING`               |
| `list_subscriptions`  | admin/consumer | All subscriptions with filters and timeouts                |
| `get_subscription`    | admin/consumer | One subscription                                           |
| `create_subscription` | admin          | Create a subscription                                      |
| `update_subscription` | admin          | Patch a subscription (`isActive: false` to pause)          |
| `delete_subscription` | admin          | Delete a subscription and its deliveries                   |
| `get_overview`        | admin/consumer | Aggregate workspace counts                                 |
| `reset_workspace`     | admin          | **Destructive.** Off unless `TRIGGERS_MCP_ENABLE_RESET`    |

Every tool declares an `outputSchema`, so results arrive as `structuredContent`
rather than prose the model has to re-parse.

API failures come back as `isError` tool results — not protocol errors — with
the machine-readable code plus a recovery hint, so the model can act on them:

```
LEASE_EXPIRED (HTTP 409): The delivery lease has expired.
Hint: The visibility timeout elapsed and the delivery was returned to the queue.
Call lease_deliveries again to obtain a fresh leaseToken; do not reuse the old one.
requestId: req_01H…
```

### The consume loop

`ack_delivery` derives a stable `X-Consumer-Process-ID` of
`mcp:<sessionId>:<deliveryId>` when you do not supply one. That keeps the API's
ACK idempotency meaningful: if a model repeats an ACK within a session it
re-confirms the original rather than looking like a second processor. Pass an
explicit `consumerProcessId` when the logical processor outlives the session.

## Resources

Read-only snapshots for orientation, registered when an admin or consumer key is
present:

| URI                                 | Contents                                   |
| ----------------------------------- | ------------------------------------------ |
| `triggers://overview`               | Aggregate counts by delivery status        |
| `triggers://subscriptions`          | Every subscription with filters            |
| `triggers://deliveries/dead-letter` | Dead-lettered deliveries with their errors |

## Roles and credentials

The API issues three key roles; the MCP server takes any subset:

| Variable                  | Grants                                  |
| ------------------------- | --------------------------------------- |
| `TRIGGERS_PRODUCER_TOKEN` | `ingest_event`                          |
| `TRIGGERS_CONSUMER_TOKEN` | the consume loop plus the read tools    |
| `TRIGGERS_ADMIN_TOKEN`    | subscription management, replay, detail |

At least one is required. Where a tool accepts either an admin or a consumer
key, the admin key is preferred when both are present.

Get tokens from `pnpm db:seed`.

## Transports

Both entrypoints wrap the same server core.

**stdio** (`pnpm mcp:stdio`) — the client launches the process and speaks
JSON-RPC over its pipes. Use this for Claude Code, Claude Desktop, and other
local hosts. Logs go to stderr; stdout carries the protocol.

**Streamable HTTP** (`pnpm dev:mcp`) — a long-running HTTP service at `/mcp`
with a `/health` endpoint. Use this for a hosted connector.

### HTTP authentication

The HTTP transport creates one MCP server per session, so each session's tool
list reflects only the roles its own credentials grant.

`MCP_HTTP_AUTH_MODE=header` (default) — the caller supplies their own Triggers
keys per session via `X-Triggers-Admin-Token`, `X-Triggers-Producer-Token`, and
`X-Triggers-Consumer-Token`. The MCP process stores no credentials of its own.

`MCP_HTTP_AUTH_MODE=shared` — the caller presents `MCP_HTTP_AUTH_TOKEN` as a
bearer token and the server lends them its own env keys. Simpler for a
single-operator deployment, but every accepted caller gets the server's full
role set, and caller-supplied role headers are ignored. Do not use it for a
shared endpoint.

Set `MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS` to enable DNS-rebinding
protection when the endpoint is reachable from a browser.

## Connecting a client

### Claude Code

```bash
claude mcp add triggers \
  --env TRIGGERS_API_URL=http://localhost:3000 \
  --env TRIGGERS_ADMIN_TOKEN=<admin> \
  --env TRIGGERS_PRODUCER_TOKEN=<producer> \
  --env TRIGGERS_CONSUMER_TOKEN=<consumer> \
  -- pnpm --filter @triggers/mcp start:stdio
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "triggers": {
      "command": "pnpm",
      "args": ["--filter", "@triggers/mcp", "start:stdio"],
      "cwd": "/absolute/path/to/TriggersAPI",
      "env": {
        "TRIGGERS_API_URL": "http://localhost:3000",
        "TRIGGERS_ADMIN_TOKEN": "…",
        "TRIGGERS_PRODUCER_TOKEN": "…",
        "TRIGGERS_CONSUMER_TOKEN": "…"
      }
    }
  }
}
```

`cwd` must be absolute — the client does not inherit your shell's directory.

### Remote (Streamable HTTP)

Point a client at `https://<host>/mcp` and send the role headers:

```
X-Triggers-Consumer-Token: <consumer key>
```

Or check it by hand:

```bash
curl -s https://<host>/health
```

## Configuration

| Variable                      | Default                 | Purpose                                               |
| ----------------------------- | ----------------------- | ----------------------------------------------------- |
| `TRIGGERS_API_URL`            | `http://localhost:3000` | API base URL                                          |
| `TRIGGERS_ADMIN_TOKEN`        | —                       | Admin key (optional)                                  |
| `TRIGGERS_PRODUCER_TOKEN`     | —                       | Producer key (optional)                               |
| `TRIGGERS_CONSUMER_TOKEN`     | —                       | Consumer key (optional)                               |
| `TRIGGERS_REQUEST_TIMEOUT_MS` | `45000`                 | HTTP timeout; must exceed the long-poll ceiling (35s) |
| `TRIGGERS_MCP_ENABLE_RESET`   | `false`                 | Exposes the destructive `reset_workspace` tool        |
| `MCP_HTTP_HOST`               | `0.0.0.0`               | HTTP bind host                                        |
| `MCP_HTTP_PORT`               | `3100`                  | HTTP port                                             |
| `MCP_HTTP_AUTH_MODE`          | `header`                | `header` or `shared`                                  |
| `MCP_HTTP_AUTH_TOKEN`         | —                       | Gateway secret, required in `shared` mode             |
| `MCP_ALLOWED_HOSTS`           | —                       | CSV; enables DNS-rebinding protection                 |
| `MCP_ALLOWED_ORIGINS`         | —                       | CSV; enables DNS-rebinding protection                 |
| `LOG_LEVEL`                   | `info`                  | Pino level                                            |

Everything is validated at startup, so a bad value fails immediately rather than
on the first tool call. A blank token variable is treated as absent.

## Deployment

`render.yaml` provisions a `triggers-mcp` web service from
`apps/mcp/Dockerfile`. It needs neither Postgres nor Redis — only
`TRIGGERS_API_URL` pointing at the API. It defaults to `header` auth mode, so no
Triggers keys are stored on the service.

## Testing

```bash
pnpm --filter @triggers/mcp test
```

The suite covers the HTTP client (envelope unwrapping, typed errors, header
handling), role-gated registration, every tool's request shape, resources, and
config validation. Two of the files are genuine end-to-end tests: one boots the
Streamable HTTP server on a real socket and drives it with a real MCP client;
the other spawns the stdio entrypoint as a child process and completes a
handshake with logging enabled, which is what proves logs go to stderr rather
than corrupting the protocol stream.
