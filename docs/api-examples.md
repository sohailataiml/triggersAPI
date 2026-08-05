# TriggersAPI — API examples

All examples assume the API at `http://localhost:3000` and tokens from `pnpm db:seed`.
Success bodies are wrapped in `{ "data": ... }`; errors in `{ "error": { code, message, requestId } }`.

## Ingest an event (producer)

```bash
curl -X POST http://localhost:3000/v1/events \
  -H "Authorization: Bearer $PRODUCER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: gh-pr-431" \
  -d '{
    "source": "github",
    "eventType": "pull_request.opened",
    "subject": "repo:acme/widgets",
    "payload": { "pullRequestId": 431, "author": "sohail" },
    "metadata": { "traceId": "trace_123" }
  }'
```

```json
{
  "data": {
    "eventId": "0198…",
    "receivedAt": "…",
    "matchedSubscriptions": 1,
    "status": "accepted",
    "duplicate": false
  }
}
```

`201` for a new event, `200` with `"duplicate": true` when the `Idempotency-Key` was seen before.

## Create a subscription (admin)

```bash
curl -X POST http://localhost:3000/v1/subscriptions \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHub pull requests",
    "filters": { "source": "github", "eventType": "pull_request.opened" },
    "visibilityTimeoutSeconds": 60,
    "maxAttempts": 5
  }'
```

## Lease from the inbox (consumer, long polling)

```bash
curl "http://localhost:3000/v1/inbox?subscriptionId=$SUB_ID&wait=30&limit=10" \
  -H "Authorization: Bearer $CONSUMER_TOKEN"
```

```json
{ "data": { "items": [ { "deliveryId": "0198…", "leaseToken": "…", "leaseUntil": "…", "attempt": 1, "event": { … } } ], "nextPollAfterMs": 0 } }
```

## ACK a delivery (idempotent)

```bash
curl -X POST http://localhost:3000/v1/deliveries/$DELIVERY_ID/ack \
  -H "Authorization: Bearer $CONSUMER_TOKEN" \
  -H "X-Consumer-Process-ID: agent-run-73-step-4" \
  -H "Content-Type: application/json" \
  -d '{ "leaseToken": "…" }'
```

Repeating with the same `X-Consumer-Process-ID` returns `"duplicateAck": true`.

## NACK a delivery (retry or dead-letter)

```bash
curl -X POST http://localhost:3000/v1/deliveries/$DELIVERY_ID/nack \
  -H "Authorization: Bearer $CONSUMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "leaseToken": "…", "reason": "downstream_unavailable", "message": "CRM 503" }'
```

## Replay a dead-letter delivery (admin)

```bash
curl -X POST http://localhost:3000/v1/deliveries/$DELIVERY_ID/replay \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Idempotency-Key: replay-req-1" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Downstream integration repaired" }'
```

## SSE Explorer stream

```bash
curl -N "http://localhost:3000/v1/explorer/stream?token=$ADMIN_TOKEN"
```

```
event: event.ingested
id: 1722874023000-0
data: {"type":"event.ingested","eventId":"0198…", …}
```

## TypeScript consumer loop

```ts
while (true) {
  const res = await fetch(`${baseUrl}/v1/inbox?subscriptionId=${subscriptionId}&wait=30&limit=10`, {
    headers: { Authorization: `Bearer ${consumerKey}` },
  });
  const { data } = await res.json();

  for (const item of data.items) {
    const processId = `${workerId}:${item.deliveryId}`;
    try {
      await processEvent(item.event); // your idempotent handler
      await fetch(`${baseUrl}/v1/deliveries/${item.deliveryId}/ack`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${consumerKey}`,
          'Content-Type': 'application/json',
          'X-Consumer-Process-ID': processId,
        },
        body: JSON.stringify({ leaseToken: item.leaseToken }),
      });
    } catch (error) {
      await fetch(`${baseUrl}/v1/deliveries/${item.deliveryId}/nack`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${consumerKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leaseToken: item.leaseToken,
          reason: 'processing_failed',
          message: error instanceof Error ? error.message : 'unknown',
        }),
      });
    }
  }
}
```
