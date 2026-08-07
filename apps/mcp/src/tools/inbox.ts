import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { inboxItemSchema, inboxQuerySchema, type InboxResponse } from '@triggers/contracts';
import type { TriggersClient } from '../client.js';
import { guard, ok } from './result.js';

/** Headroom over the server-side long-poll ceiling so the client never aborts first. */
const LONG_POLL_TIMEOUT_MARGIN_MS = 10_000;

const leaseOutputSchema = z.object({
  count: z.number().int(),
  items: z.array(inboxItemSchema),
  nextPollAfterMs: z.number().int(),
});

export function registerInboxTools(server: McpServer, client: TriggersClient): void {
  if (!client.hasRole('consumer')) return;

  server.registerTool(
    'lease_deliveries',
    {
      title: 'Lease deliveries from the inbox',
      description: [
        'Lease up to `limit` pending deliveries for a subscription. Each returned item carries a leaseToken and a leaseUntil timestamp.',
        'Leasing is exclusive: no other consumer receives the same delivery while the lease holds. If you do not ack_delivery before leaseUntil, the delivery is redelivered and its attempt count increases — so lease only what you can process within the visibility timeout.',
        'Set wait (0-30 seconds) to long-poll: the call returns the moment an event arrives rather than immediately with an empty list. An empty items array is a normal outcome, not an error.',
        'Every leased delivery must be settled with ack_delivery (success) or nack_delivery (failure). Delivery is at-least-once, so your handling must be idempotent.',
      ].join('\n\n'),
      inputSchema: inboxQuerySchema,
      outputSchema: leaseOutputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    guard(async (query) => {
      const data = await client.request<InboxResponse>('consumer', 'GET', '/v1/inbox', {
        query: {
          subscriptionId: query.subscriptionId,
          limit: query.limit,
          wait: query.wait,
          visibilityTimeout: query.visibilityTimeout,
          consumerInstanceId: query.consumerInstanceId ?? client.consumerProcessPrefix,
        },
        // Never let the HTTP client abort before the server-side long poll ends.
        timeoutMs: Math.max(
          client.defaultTimeoutMs,
          query.wait * 1000 + LONG_POLL_TIMEOUT_MARGIN_MS,
        ),
      });
      return ok({
        count: data.items.length,
        items: data.items,
        nextPollAfterMs: data.nextPollAfterMs,
      });
    }),
  );
}
