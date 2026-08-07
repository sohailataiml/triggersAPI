import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { explorerOverviewSchema, type ExplorerOverview } from '@triggers/contracts';
import type { TriggersClient } from '../client.js';
import { guard, ok } from './result.js';

const resetOutputSchema = z.object({ eventsDeleted: z.number().int() });

export interface ExplorerToolOptions {
  /** Exposes the destructive workspace reset. Off unless explicitly enabled. */
  enableReset: boolean;
}

export function registerExplorerTools(
  server: McpServer,
  client: TriggersClient,
  options: ExplorerToolOptions,
): void {
  if (client.hasRole('admin') || client.hasRole('consumer')) {
    server.registerTool(
      'get_overview',
      {
        title: 'Workspace overview',
        description:
          'Aggregate counts for the workspace: total events, plus deliveries pending, activeLeases, retryScheduled, deadLetter, and acknowledged. The cheapest way to check overall health before drilling in.',
        outputSchema: explorerOverviewSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      guard(async () => {
        const role = client.pickRole(['admin', 'consumer']);
        const data = await client.request<ExplorerOverview>(role, 'GET', '/v1/explorer/overview');
        return ok(data);
      }),
    );
  }

  if (!options.enableReset || !client.hasRole('admin')) return;

  server.registerTool(
    'reset_workspace',
    {
      title: 'Reset workspace (destructive)',
      description: [
        'DESTRUCTIVE AND IRREVERSIBLE. Permanently deletes every event and delivery in the workspace. Subscriptions and API keys are kept.',
        'Intended only for resetting a demo environment. Confirm with the operator before calling, and pass confirm=true to acknowledge the data loss.',
      ].join('\n\n'),
      inputSchema: z.object({
        confirm: z
          .literal(true)
          .describe('Must be true. Explicit acknowledgement that all events will be deleted.'),
      }),
      outputSchema: resetOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    guard(async () => {
      const data = await client.request<{ eventsDeleted: number }>(
        'admin',
        'POST',
        '/v1/explorer/reset',
      );
      return ok(data);
    }),
  );
}
