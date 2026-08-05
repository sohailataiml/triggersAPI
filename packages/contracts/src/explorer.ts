import { z } from 'zod';

export const explorerActivityTypeSchema = z.enum([
  'event.ingested',
  'delivery.created',
  'delivery.leased',
  'delivery.acknowledged',
  'delivery.retry_scheduled',
  'delivery.dead_lettered',
  'delivery.replayed',
]);

export type ExplorerActivityType = z.infer<typeof explorerActivityTypeSchema>;

export const explorerActivitySchema = z.object({
  type: explorerActivityTypeSchema,
  timestamp: z.string().datetime(),
  workspaceId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  deliveryId: z.string().uuid().optional(),
  subscriptionId: z.string().uuid().optional(),
  status: z.string().optional(),
  summary: z.record(z.string(), z.unknown()).optional(),
});

export type ExplorerActivity = z.infer<typeof explorerActivitySchema>;
