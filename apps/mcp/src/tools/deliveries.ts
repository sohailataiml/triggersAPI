import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  ackRequestSchema,
  ackResponseSchema,
  deliveryDetailSchema,
  deliveryListItemSchema,
  deliveryListQuerySchema,
  nackRequestSchema,
  nackResponseSchema,
  replayRequestSchema,
  replayResponseSchema,
  type AckResponse,
  type DeliveryDetail,
  type DeliveryListItem,
  type NackResponse,
  type ReplayResponse,
} from '@triggers/contracts';
import type { TriggersClient } from '../client.js';
import { guard, ok } from './result.js';

const deliveryIdSchema = z.object({
  deliveryId: z.string().uuid().describe('The delivery id returned by lease_deliveries.'),
});

const consumerProcessIdSchema = z
  .string()
  .min(1)
  .max(256)
  .optional()
  .describe(
    'Stable identifier for the logical processor of this delivery. ACK is idempotent per (deliveryId, consumerProcessId), so reusing the same value safely re-confirms rather than double-processing. Defaults to a value derived from this MCP session.',
  );

const listDeliveriesOutputSchema = z.object({
  count: z.number().int(),
  items: z.array(deliveryListItemSchema),
});

export function registerDeliveryTools(server: McpServer, client: TriggersClient): void {
  if (client.hasRole('consumer')) {
    server.registerTool(
      'ack_delivery',
      {
        title: 'Acknowledge a delivery',
        description: [
          'Mark a leased delivery as successfully processed. This is terminal: the delivery will never be redelivered.',
          'Requires the leaseToken from lease_deliveries, and the lease must still be valid — if leaseUntil has passed you will get LEASE_EXPIRED and must lease again.',
          'ACK is idempotent per consumerProcessId: repeating the same call returns the original result with duplicateAck=true.',
        ].join('\n\n'),
        inputSchema: deliveryIdSchema
          .merge(ackRequestSchema)
          .extend({ consumerProcessId: consumerProcessIdSchema }),
        outputSchema: ackResponseSchema,
        annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
      },
      guard(async ({ deliveryId, leaseToken, consumerProcessId }) => {
        const data = await client.request<AckResponse>(
          'consumer',
          'POST',
          `/v1/deliveries/${deliveryId}/ack`,
          {
            body: { leaseToken },
            headers: {
              'X-Consumer-Process-ID':
                consumerProcessId ?? `${client.consumerProcessPrefix}:${deliveryId}`,
            },
          },
        );
        return ok(data);
      }),
    );

    server.registerTool(
      'nack_delivery',
      {
        title: 'Negatively acknowledge a delivery',
        description: [
          'Report that processing failed. The delivery is either rescheduled with exponential backoff (5s, 15s, 45s, 2m, 5m with jitter) or dead-lettered once the subscription maxAttempts is reached.',
          'The response status tells you which happened: RETRY_SCHEDULED with an availableAt timestamp, or DEAD_LETTER.',
          'Always supply a reason and message — they are stored on the delivery as lastErrorCode/lastErrorMessage and are what an operator sees when triaging the dead-letter queue.',
        ].join('\n\n'),
        inputSchema: deliveryIdSchema.merge(nackRequestSchema),
        outputSchema: nackResponseSchema,
        annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
      },
      guard(async ({ deliveryId, ...body }) => {
        const data = await client.request<NackResponse>(
          'consumer',
          'POST',
          `/v1/deliveries/${deliveryId}/nack`,
          { body },
        );
        return ok(data);
      }),
    );
  }

  if (client.hasRole('admin') || client.hasRole('consumer')) {
    server.registerTool(
      'list_deliveries',
      {
        title: 'List deliveries',
        description: [
          'List deliveries with optional filters on status, subscriptionId, source, and eventType.',
          'Use status=DEAD_LETTER to triage failures, status=RETRY_SCHEDULED to see what is waiting on backoff, or status=LEASED to see what is currently in flight.',
        ].join('\n\n'),
        inputSchema: deliveryListQuerySchema,
        outputSchema: listDeliveriesOutputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      guard(async (query) => {
        const role = client.pickRole(['admin', 'consumer']);
        const items = await client.request<DeliveryListItem[]>(role, 'GET', '/v1/deliveries', {
          query,
        });
        return ok({ count: items.length, items });
      }),
    );
  }

  if (!client.hasRole('admin')) return;

  server.registerTool(
    'get_delivery',
    {
      title: 'Get delivery detail',
      description:
        'Full state for one delivery: status, attemptCount, lease window, acknowledgement and dead-letter timestamps, last error, and replay count. Use this before replay_delivery to confirm the delivery is actually in DEAD_LETTER.',
      inputSchema: deliveryIdSchema,
      outputSchema: deliveryDetailSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guard(async ({ deliveryId }) => {
      const data = await client.request<DeliveryDetail>(
        'admin',
        'GET',
        `/v1/deliveries/${deliveryId}`,
      );
      return ok(data);
    }),
  );

  server.registerTool(
    'replay_delivery',
    {
      title: 'Replay a dead-letter delivery',
      description: [
        'Return a DEAD_LETTER delivery to PENDING so it can be leased and processed again. Only valid for dead-lettered deliveries; anything else returns INVALID_STATE.',
        'Every replay is audited with the requesting key and the supplied reason. Pass idempotencyKey to make a retried replay request safe.',
        'Replay reintroduces work a consumer already saw at least once, so the downstream handler must be idempotent.',
      ].join('\n\n'),
      inputSchema: deliveryIdSchema.merge(replayRequestSchema).extend({
        idempotencyKey: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe('Optional Idempotency-Key so a retried replay does not double-replay.'),
      }),
      outputSchema: replayResponseSchema,
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    guard(async ({ deliveryId, idempotencyKey, ...body }) => {
      const data = await client.request<ReplayResponse>(
        'admin',
        'POST',
        `/v1/deliveries/${deliveryId}/replay`,
        {
          body,
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        },
      );
      return ok(data);
    }),
  );
}
