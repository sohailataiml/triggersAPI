import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  dataEnvelope,
  ForbiddenError,
  inboxQuerySchema,
  inboxResponseSchema,
} from '@triggers/contracts';
import { ApiKeyRole, requireRole } from '../services/auth.service.js';
import type { DeliveryService } from '../services/delivery.service.js';
import type { SubscriptionService } from '../services/subscription.service.js';

export async function registerInboxRoutes(
  app: FastifyInstance,
  deliveries: DeliveryService,
  subscriptions: SubscriptionService,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/inbox',
    {
      preHandler: requireRole(ApiKeyRole.CONSUMER),
      schema: {
        tags: ['inbox'],
        summary: 'Lease available deliveries for a subscription',
        querystring: inboxQuerySchema,
        response: { 200: dataEnvelope(inboxResponseSchema) },
      },
    },
    async (request, reply) => {
      const principal = request.principal!;
      const query = request.query;

      // A subscription-scoped consumer key may only read its own subscription.
      if (principal.subscriptionId && principal.subscriptionId !== query.subscriptionId) {
        throw new ForbiddenError('Consumer key is not scoped to this subscription');
      }

      // Verifies the subscription exists in this workspace (throws 404 otherwise).
      const subscription = await subscriptions.get(principal.workspaceId, query.subscriptionId);

      const visibilityTimeoutSeconds =
        query.visibilityTimeout ?? subscription.visibilityTimeoutSeconds;

      const items = await deliveries.lease({
        workspaceId: principal.workspaceId,
        subscriptionId: query.subscriptionId,
        limit: query.limit,
        visibilityTimeoutSeconds,
        consumerInstanceId: query.consumerInstanceId ?? null,
      });

      return reply.send({ data: { items, nextPollAfterMs: 0 } });
    },
  );
}
