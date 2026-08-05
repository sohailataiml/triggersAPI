import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ackRequestSchema,
  ackResponseSchema,
  dataEnvelope,
  ValidationError,
} from '@triggers/contracts';
import { ApiKeyRole, requireRole } from '../services/auth.service.js';
import type { DeliveryService } from '../services/delivery.service.js';

const deliveryParam = z.object({ deliveryId: z.string().uuid() });

export async function registerDeliveryRoutes(
  app: FastifyInstance,
  deliveries: DeliveryService,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/deliveries/:deliveryId/ack',
    {
      preHandler: requireRole(ApiKeyRole.CONSUMER),
      schema: {
        tags: ['deliveries'],
        summary: 'Acknowledge a leased delivery (idempotent per process id)',
        params: deliveryParam,
        body: ackRequestSchema,
        response: { 200: dataEnvelope(ackResponseSchema) },
      },
    },
    async (request, reply) => {
      const end = app.metrics.ackLatencySeconds.startTimer();
      const principal = request.principal!;

      const processIdHeader = request.headers['x-consumer-process-id'];
      const consumerProcessId = typeof processIdHeader === 'string' ? processIdHeader.trim() : '';
      if (!consumerProcessId) {
        throw new ValidationError('X-Consumer-Process-ID header is required');
      }

      const data = await deliveries.ack({
        workspaceId: principal.workspaceId,
        deliveryId: request.params.deliveryId,
        leaseToken: request.body.leaseToken,
        consumerProcessId,
        allowedSubscriptionId: principal.subscriptionId,
      });
      end();

      return reply.send({ data });
    },
  );
}
