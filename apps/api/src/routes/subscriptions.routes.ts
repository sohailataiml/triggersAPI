import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  createSubscriptionSchema,
  dataEnvelope,
  subscriptionResponseSchema,
  updateSubscriptionSchema,
} from '@triggers/contracts';
import { ApiKeyRole, requireRole } from '../services/auth.service.js';
import type { SubscriptionService } from '../services/subscription.service.js';

const idParam = z.object({ id: z.string().uuid() });

export async function registerSubscriptionRoutes(
  app: FastifyInstance,
  service: SubscriptionService,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/subscriptions',
    {
      preHandler: requireRole(ApiKeyRole.ADMIN),
      schema: {
        tags: ['subscriptions'],
        body: createSubscriptionSchema,
        response: { 201: dataEnvelope(subscriptionResponseSchema) },
      },
    },
    async (request, reply) => {
      const data = await service.create(request.principal!.workspaceId, request.body);
      return reply.status(201).send({ data });
    },
  );

  r.get(
    '/subscriptions',
    {
      preHandler: requireRole(ApiKeyRole.ADMIN, ApiKeyRole.CONSUMER),
      schema: {
        tags: ['subscriptions'],
        response: { 200: dataEnvelope(z.array(subscriptionResponseSchema)) },
      },
    },
    async (request, reply) => {
      const data = await service.list(request.principal!.workspaceId);
      return reply.send({ data });
    },
  );

  r.get(
    '/subscriptions/:id',
    {
      preHandler: requireRole(ApiKeyRole.ADMIN, ApiKeyRole.CONSUMER),
      schema: {
        tags: ['subscriptions'],
        params: idParam,
        response: { 200: dataEnvelope(subscriptionResponseSchema) },
      },
    },
    async (request, reply) => {
      const data = await service.get(request.principal!.workspaceId, request.params.id);
      return reply.send({ data });
    },
  );

  r.delete(
    '/subscriptions/:id',
    {
      preHandler: requireRole(ApiKeyRole.ADMIN),
      schema: {
        tags: ['subscriptions'],
        params: idParam,
        response: { 200: dataEnvelope(z.object({ deleted: z.literal(true) })) },
      },
    },
    async (request, reply) => {
      await service.delete(request.principal!.workspaceId, request.params.id);
      return reply.send({ data: { deleted: true as const } });
    },
  );

  r.patch(
    '/subscriptions/:id',
    {
      preHandler: requireRole(ApiKeyRole.ADMIN),
      schema: {
        tags: ['subscriptions'],
        params: idParam,
        body: updateSubscriptionSchema,
        response: { 200: dataEnvelope(subscriptionResponseSchema) },
      },
    },
    async (request, reply) => {
      const data = await service.update(
        request.principal!.workspaceId,
        request.params.id,
        request.body,
      );
      return reply.send({ data });
    },
  );
}
