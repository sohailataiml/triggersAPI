import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  eventListItemSchema,
  eventListQuerySchema,
  ingestEventResponseSchema,
  ingestEventSchema,
  type EventListItem,
  type IngestEventResponse,
} from '@triggers/contracts';
import type { TriggersClient } from '../client.js';
import { guard, ok } from './result.js';

const ingestInputSchema = ingestEventSchema.extend({
  idempotencyKey: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      'Optional Idempotency-Key. Re-ingesting with the same key returns the original event and sets duplicate=true instead of creating a second event.',
    ),
});

const listEventsOutputSchema = z.object({
  count: z.number().int(),
  items: z.array(eventListItemSchema),
});

export function registerEventTools(server: McpServer, client: TriggersClient): void {
  if (client.hasRole('producer')) {
    server.registerTool(
      'ingest_event',
      {
        title: 'Ingest an event',
        description: [
          'Publish an event into the Triggers platform. The event is written to Postgres and fanned out to every active subscription whose filters match on source, eventType, and subject (exact match; an unset filter matches anything).',
          'Returns matchedSubscriptions — a count of 0 means the event was accepted but no consumer will ever see it, which usually indicates a missing or mis-filtered subscription.',
          'Pass idempotencyKey when the caller might retry: a repeat returns the original eventId with duplicate=true.',
        ].join('\n\n'),
        inputSchema: ingestInputSchema,
        outputSchema: ingestEventResponseSchema,
        annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
      },
      guard(async ({ idempotencyKey, ...body }) => {
        const data = await client.request<IngestEventResponse>('producer', 'POST', '/v1/events', {
          body,
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        });
        return ok(data);
      }),
    );
  }

  if (client.hasRole('admin') || client.hasRole('consumer')) {
    server.registerTool(
      'list_events',
      {
        title: 'List events',
        description: [
          'List recent events with a per-status rollup of their deliveries (pending, leased, retryScheduled, acknowledged, deadLetter).',
          'This is the fastest way to answer "did my event get delivered?" — filter by source/eventType, or use search for a free-text match on subject.',
        ].join('\n\n'),
        inputSchema: eventListQuerySchema,
        outputSchema: listEventsOutputSchema,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      guard(async (query) => {
        const role = client.pickRole(['admin', 'consumer']);
        const items = await client.request<EventListItem[]>(role, 'GET', '/v1/events', { query });
        return ok({ count: items.length, items });
      }),
    );
  }
}
