import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ackRequestSchema,
  ackResponseSchema,
  dataEnvelope,
  deliveryDetailSchema,
  nackRequestSchema,
  nackResponseSchema,
  replayRequestSchema,
  replayResponseSchema,
  ValidationError,
} from '@triggers/contracts';
import { ApiKeyRole, requireRole } from '../services/auth.service.js';
import type { DeliveryService } from '../services/delivery.service.js';
import type { DeliveryReadService } from '../services/delivery-read.service.js';
import type { ReplayService } from '../services/replay.service.js';

const deliveryParam = z.object({ deliveryId: z.string().uuid() });

export interface DeliveryRouteDeps {
  deliveries: DeliveryService;
  deliveryReads: DeliveryReadService;
  replays: ReplayService;
}

export async function registerDeliveryRoutes(
  app: FastifyInstance,
  deps: DeliveryRouteDeps,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { deliveries, deliveryReads, replays } = deps;

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

  r.post(
    '/deliveries/:deliveryId/nack',
    {
      preHandler: requireRole(ApiKeyRole.CONSUMER),
      schema: {
        tags: ['deliveries'],
        summary: 'Negatively acknowledge a delivery (schedules retry or dead-letters)',
        params: deliveryParam,
        body: nackRequestSchema,
        response: { 200: dataEnvelope(nackResponseSchema) },
      },
    },
    async (request, reply) => {
      const principal = request.principal!;
      const data = await deliveries.nack({
        workspaceId: principal.workspaceId,
        deliveryId: request.params.deliveryId,
        leaseToken: request.body.leaseToken,
        reason: request.body.reason ?? null,
        message: request.body.message ?? null,
        allowedSubscriptionId: principal.subscriptionId,
      });
      return reply.send({ data });
    },
  );

  r.post(
    '/deliveries/:deliveryId/replay',
    {
      preHandler: requireRole(ApiKeyRole.ADMIN),
      schema: {
        tags: ['deliveries'],
        summary: 'Replay a dead-letter delivery (admin)',
        params: deliveryParam,
        body: replayRequestSchema,
        response: { 200: dataEnvelope(replayResponseSchema) },
      },
    },
    async (request, reply) => {
      const principal = request.principal!;
      const idem = request.headers['idempotency-key'];
      const idempotencyKey = typeof idem === 'string' && idem.length > 0 ? idem : null;

      const data = await replays.replay({
        workspaceId: principal.workspaceId,
        deliveryId: request.params.deliveryId,
        requestedBy: principal.apiKeyId,
        reason: request.body.reason ?? null,
        idempotencyKey,
      });
      return reply.send({ data });
    },
  );

  r.get(
    '/deliveries/:deliveryId',
    {
      preHandler: requireRole(ApiKeyRole.ADMIN),
      schema: {
        tags: ['deliveries'],
        summary: 'Get delivery detail (admin)',
        params: deliveryParam,
        response: { 200: dataEnvelope(deliveryDetailSchema) },
      },
    },
    async (request, reply) => {
      const data = await deliveryReads.getDetail(
        request.principal!.workspaceId,
        request.params.deliveryId,
      );
      return reply.send({ data });
    },
  );
}
