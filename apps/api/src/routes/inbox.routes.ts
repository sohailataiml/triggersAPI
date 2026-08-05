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
import type { LongPollService } from '../services/long-poll.service.js';

export interface InboxRouteDeps {
  deliveries: DeliveryService;
  subscriptions: SubscriptionService;
  longPoll: LongPollService;
}

export async function registerInboxRoutes(
  app: FastifyInstance,
  deps: InboxRouteDeps,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { deliveries, subscriptions, longPoll } = deps;

  r.get(
    '/inbox',
    {
      preHandler: requireRole(ApiKeyRole.CONSUMER),
      schema: {
        tags: ['inbox'],
        summary: 'Lease available deliveries; optionally long-poll with ?wait=<seconds>',
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

      // Clamp wait to the configured maximum.
      const waitSeconds = Math.min(query.wait, app.appConfig.MAX_LONG_POLL_SECONDS);

      const attempt = () =>
        deliveries.lease({
          workspaceId: principal.workspaceId,
          subscriptionId: query.subscriptionId,
          limit: query.limit,
          visibilityTimeoutSeconds,
          consumerInstanceId: query.consumerInstanceId ?? null,
        });

      // Abort the poll cleanly if the client disconnects.
      const controller = new AbortController();
      const onClose = () => controller.abort();
      request.raw.on('close', onClose);

      try {
        const items = await longPoll.poll({
          subscriptionId: query.subscriptionId,
          apiKeyPrefix: principal.apiKeyId,
          waitSeconds,
          maxActivePerKey: app.appConfig.MAX_ACTIVE_LONG_POLLS_PER_KEY,
          attempt,
          signal: controller.signal,
        });
        return await reply.send({ data: { items, nextPollAfterMs: 0 } });
      } finally {
        request.raw.removeListener('close', onClose);
      }
    },
  );
}
