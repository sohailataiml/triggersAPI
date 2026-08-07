import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { DeliveryListItem, ExplorerOverview, SubscriptionResponse } from '@triggers/contracts';
import type { TriggersClient } from './client.js';

function jsonResource(uri: URL, data: unknown): ReadResourceResult {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Read-only snapshots the model can pull for orientation without spending a
 * tool call. Registered only when a key that can read them is configured.
 */
export function registerResources(server: McpServer, client: TriggersClient): void {
  if (!client.hasRole('admin') && !client.hasRole('consumer')) return;

  server.registerResource(
    'workspace-overview',
    'triggers://overview',
    {
      title: 'Workspace overview',
      description:
        'Live aggregate counts: total events and deliveries by status (pending, leased, retry-scheduled, dead-letter, acknowledged).',
      mimeType: 'application/json',
    },
    async (uri) => {
      const role = client.pickRole(['admin', 'consumer']);
      const data = await client.request<ExplorerOverview>(role, 'GET', '/v1/explorer/overview');
      return jsonResource(uri, data);
    },
  );

  server.registerResource(
    'subscriptions',
    'triggers://subscriptions',
    {
      title: 'Subscriptions',
      description:
        'Every subscription in the workspace with its filters, visibility timeout, and retry ceiling.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const role = client.pickRole(['admin', 'consumer']);
      const data = await client.request<SubscriptionResponse[]>(role, 'GET', '/v1/subscriptions');
      return jsonResource(uri, data);
    },
  );

  server.registerResource(
    'dead-letter-queue',
    'triggers://deliveries/dead-letter',
    {
      title: 'Dead-letter queue',
      description:
        'Deliveries that exhausted their retry budget, with the last error recorded for each. These are the failures a human or agent needs to triage.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const role = client.pickRole(['admin', 'consumer']);
      const data = await client.request<DeliveryListItem[]>(role, 'GET', '/v1/deliveries', {
        query: { status: 'DEAD_LETTER', limit: 200 },
      });
      return jsonResource(uri, data);
    },
  );
}
