import { z } from 'zod';

export const subscriptionFiltersSchema = z.object({
  source: z.string().max(128).nullish(),
  eventType: z.string().max(256).nullish(),
  subject: z.string().max(512).nullish(),
});

export const createSubscriptionSchema = z.object({
  name: z.string().min(1).max(256),
  filters: subscriptionFiltersSchema.default({}),
  visibilityTimeoutSeconds: z.number().int().positive().max(3600).optional(),
  maxAttempts: z.number().int().positive().max(50).optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const updateSubscriptionSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  filters: subscriptionFiltersSchema.optional(),
  visibilityTimeoutSeconds: z.number().int().positive().max(3600).optional(),
  maxAttempts: z.number().int().positive().max(50).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const subscriptionResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  filters: z.object({
    source: z.string().nullable(),
    eventType: z.string().nullable(),
    subject: z.string().nullable(),
  }),
  isActive: z.boolean(),
  visibilityTimeoutSeconds: z.number().int(),
  maxAttempts: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;
