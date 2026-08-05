import { z } from 'zod';

/** Query parameters for GET /v1/inbox. Coerced from strings. */
export const inboxQuerySchema = z.object({
  subscriptionId: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(100).default(10),
  wait: z.coerce.number().int().min(0).max(30).default(0),
  visibilityTimeout: z.coerce.number().int().positive().max(3600).optional(),
  consumerInstanceId: z.string().max(256).optional(),
});

export type InboxQuery = z.infer<typeof inboxQuerySchema>;

export const inboxItemSchema = z.object({
  deliveryId: z.string().uuid(),
  eventId: z.string().uuid(),
  leaseToken: z.string(),
  leaseUntil: z.string().datetime(),
  attempt: z.number().int().positive(),
  event: z.object({
    source: z.string(),
    eventType: z.string(),
    subject: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.unknown()),
    receivedAt: z.string().datetime(),
  }),
});

export type InboxItem = z.infer<typeof inboxItemSchema>;

export const inboxResponseSchema = z.object({
  items: z.array(inboxItemSchema),
  nextPollAfterMs: z.number().int().nonnegative(),
});

export type InboxResponse = z.infer<typeof inboxResponseSchema>;
