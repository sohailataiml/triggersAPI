import { z } from 'zod';

/** Request body for POST /v1/events. */
export const ingestEventSchema = z.object({
  source: z.string().min(1).max(128),
  eventType: z.string().min(1).max(256),
  subject: z.string().max(512).optional(),
  schemaVersion: z.string().max(64).optional(),
  occurredAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type IngestEventInput = z.infer<typeof ingestEventSchema>;

/** Response body for POST /v1/events. */
export const ingestEventResponseSchema = z.object({
  eventId: z.string().uuid(),
  receivedAt: z.string().datetime(),
  matchedSubscriptions: z.number().int().nonnegative(),
  status: z.literal('accepted'),
  duplicate: z.boolean(),
});

export type IngestEventResponse = z.infer<typeof ingestEventResponseSchema>;
