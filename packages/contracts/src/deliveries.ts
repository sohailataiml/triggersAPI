import { z } from 'zod';

export const deliveryStatusSchema = z.enum([
  'PENDING',
  'LEASED',
  'RETRY_SCHEDULED',
  'ACKNOWLEDGED',
  'DEAD_LETTER',
]);

export type DeliveryStatusValue = z.infer<typeof deliveryStatusSchema>;

export const ackRequestSchema = z.object({
  leaseToken: z.string().min(1),
});

export type AckRequest = z.infer<typeof ackRequestSchema>;

export const ackResponseSchema = z.object({
  deliveryId: z.string().uuid(),
  status: z.literal('acknowledged'),
  acknowledgedAt: z.string().datetime(),
  duplicateAck: z.boolean(),
});

export type AckResponse = z.infer<typeof ackResponseSchema>;

export const nackRequestSchema = z.object({
  leaseToken: z.string().min(1),
  reason: z.string().max(256).optional(),
  message: z.string().max(1024).optional(),
});

export type NackRequest = z.infer<typeof nackRequestSchema>;

export const nackResponseSchema = z.object({
  deliveryId: z.string().uuid(),
  status: z.enum(['RETRY_SCHEDULED', 'DEAD_LETTER']),
  attempt: z.number().int(),
  availableAt: z.string().datetime().nullable(),
});

export type NackResponse = z.infer<typeof nackResponseSchema>;

export const replayRequestSchema = z.object({
  reason: z.string().max(1024).optional(),
});

export type ReplayRequest = z.infer<typeof replayRequestSchema>;

export const replayResponseSchema = z.object({
  deliveryId: z.string().uuid(),
  status: z.literal('PENDING'),
  replayCount: z.number().int(),
  replayedAt: z.string().datetime(),
});

export type ReplayResponse = z.infer<typeof replayResponseSchema>;

/** Detailed delivery view used by admin/Explorer endpoints. */
export const deliveryDetailSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  status: deliveryStatusSchema,
  attemptCount: z.number().int(),
  availableAt: z.string().datetime(),
  leasedAt: z.string().datetime().nullable(),
  leaseUntil: z.string().datetime().nullable(),
  consumerInstanceId: z.string().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
  deadLetteredAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  replayCount: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type DeliveryDetail = z.infer<typeof deliveryDetailSchema>;
