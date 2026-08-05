import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { dataEnvelope, ingestEventResponseSchema, ingestEventSchema } from '@triggers/contracts';
import { ApiKeyRole, requireRole } from '../services/auth.service.js';
import type { EventIngestionService } from '../services/event-ingestion.service.js';

export async function registerEventRoutes(
  app: FastifyInstance,
  ingestion: EventIngestionService,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/events',
    {
      preHandler: requireRole(ApiKeyRole.PRODUCER),
      schema: {
        tags: ['events'],
        summary: 'Ingest an event',
        body: ingestEventSchema,
        response: {
          201: dataEnvelope(ingestEventResponseSchema),
          200: dataEnvelope(ingestEventResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const end = app.metrics.ingestionLatencySeconds.startTimer();
      const idem = request.headers['idempotency-key'];
      const idempotencyKey = typeof idem === 'string' && idem.length > 0 ? idem : null;

      const result = await ingestion.ingest(
        request.principal!.workspaceId,
        request.body,
        idempotencyKey,
      );
      end();

      return reply.status(result.response.duplicate ? 200 : 201).send({ data: result.response });
    },
  );
}
