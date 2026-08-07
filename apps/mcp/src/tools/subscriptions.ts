import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createSubscriptionSchema,
  subscriptionResponseSchema,
  updateSubscriptionSchema,
  type SubscriptionResponse,
} from '@triggers/contracts';
import type { TriggersClient } from '../client.js';
import { guard, ok } from './result.js';

const subscriptionIdSchema = z.object({
  subscriptionId: z.string().uuid().describe('The subscription id.'),
});

const listOutputSchema = z.object({
  count: z.number().int(),
  items: z.array(subscriptionResponseSchema),
});

const deleteOutputSchema = z.object({
  subscriptionId: z.string().uuid(),
  deleted: z.literal(true),
});

export function registerSubscriptionTools(server: McpServer, client: TriggersClient): void {
  const canRead = client.hasRole('admin') || client.hasRole('consumer');

  if (canRead) {
    server.registerTool(
      'list_subscriptions',
      {
        title: 'List subscriptions',
        description:
          'List every subscription in the workspace with its filters, visibility timeout, retry ceiling, and active flag. Call this before lease_deliveries to find the subscriptionId to consume from.',
        outputSchema: listOutputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      guard(async () => {
        const role = client.pickRole(['admin', 'consumer']);
        const items = await client.request<SubscriptionResponse[]>(
          role,
          'GET',
          '/v1/subscriptions',
        );
        return ok({ count: items.length, items });
      }),
    );

    server.registerTool(
      'get_subscription',
      {
        title: 'Get a subscription',
        description: 'Fetch a single subscription by id.',
        inputSchema: subscriptionIdSchema,
        outputSchema: subscriptionResponseSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      guard(async ({ subscriptionId }) => {
        const role = client.pickRole(['admin', 'consumer']);
        const data = await client.request<SubscriptionResponse>(
          role,
          'GET',
          `/v1/subscriptions/${subscriptionId}`,
        );
        return ok(data);
      }),
    );
  }

  if (!client.hasRole('admin')) return;

  server.registerTool(
    'create_subscription',
    {
      title: 'Create a subscription',
      description: [
        'Create a subscription that receives a delivery for every matching event.',
        'Filters are exact-match; omitting a filter field means "match anything". A subscription with no filters receives every event in the workspace.',
        'visibilityTimeoutSeconds controls how long a leased delivery stays invisible before it is redelivered (default 60). maxAttempts is the retry ceiling before dead-lettering (default 5).',
        'Subscriptions only match events ingested after they are created — create the subscription first, then ingest.',
      ].join('\n\n'),
      inputSchema: createSubscriptionSchema,
      outputSchema: subscriptionResponseSchema,
      annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
    },
    guard(async (body) => {
      const data = await client.request<SubscriptionResponse>(
        'admin',
        'POST',
        '/v1/subscriptions',
        { body },
      );
      return ok(data);
    }),
  );

  server.registerTool(
    'update_subscription',
    {
      title: 'Update a subscription',
      description:
        'Patch a subscription. Only the supplied fields change. Set isActive=false to stop new deliveries being created without deleting existing ones.',
      inputSchema: subscriptionIdSchema.merge(updateSubscriptionSchema),
      outputSchema: subscriptionResponseSchema,
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    },
    guard(async ({ subscriptionId, ...body }) => {
      const data = await client.request<SubscriptionResponse>(
        'admin',
        'PATCH',
        `/v1/subscriptions/${subscriptionId}`,
        { body },
      );
      return ok(data);
    }),
  );

  server.registerTool(
    'delete_subscription',
    {
      title: 'Delete a subscription',
      description:
        'Permanently delete a subscription and its deliveries. Prefer update_subscription with isActive=false when the intent is only to pause it.',
      inputSchema: subscriptionIdSchema,
      outputSchema: deleteOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    guard(async ({ subscriptionId }) => {
      await client.request<{ deleted: true }>(
        'admin',
        'DELETE',
        `/v1/subscriptions/${subscriptionId}`,
      );
      return ok({ subscriptionId, deleted: true as const });
    }),
  );
}
