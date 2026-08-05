import { z } from 'zod';
import { deliveryStatusSchema } from './deliveries.js';

/** Aggregate counts for the Explorer overview. */
export const explorerOverviewSchema = z.object({
  totalEvents: z.number().int(),
  pending: z.number().int(),
  activeLeases: z.number().int(),
  retryScheduled: z.number().int(),
  deadLetter: z.number().int(),
  acknowledged: z.number().int(),
});

export type ExplorerOverview = z.infer<typeof explorerOverviewSchema>;

/** Query filters for the delivery list. */
export const deliveryListQuerySchema = z.object({
  status: deliveryStatusSchema.optional(),
  subscriptionId: z.string().uuid().optional(),
  source: z.string().max(128).optional(),
  eventType: z.string().max(256).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;

/** A delivery row enriched with its event summary for list views. */
export const deliveryListItemSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  status: deliveryStatusSchema,
  attemptCount: z.number().int(),
  availableAt: z.string().datetime(),
  leaseUntil: z.string().datetime().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
  deadLetteredAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().nullable(),
  replayCount: z.number().int(),
  createdAt: z.string().datetime(),
  event: z.object({
    source: z.string(),
    eventType: z.string(),
    subject: z.string().nullable(),
  }),
});

export type DeliveryListItem = z.infer<typeof deliveryListItemSchema>;
