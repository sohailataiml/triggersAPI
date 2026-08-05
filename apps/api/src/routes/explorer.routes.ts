import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { dataEnvelope, explorerOverviewSchema } from '@triggers/contracts';
import { ApiKeyRole, requireRole, requireRoleAllowQueryToken } from '../services/auth.service.js';
import type { DeliveryReadService } from '../services/delivery-read.service.js';
import { EXPLORER_ACTIVITY_STREAM } from '../lib/keys.js';

const HEARTBEAT_MS = 15_000;
const XREAD_BLOCK_MS = 5_000;

export async function registerExplorerRoutes(
  app: FastifyInstance,
  deliveryReads: DeliveryReadService,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/explorer/overview',
    {
      preHandler: requireRole(ApiKeyRole.ADMIN, ApiKeyRole.CONSUMER),
      schema: {
        tags: ['explorer'],
        summary: 'Aggregate delivery/event counts',
        response: { 200: dataEnvelope(explorerOverviewSchema) },
      },
    },
    async (request, reply) => {
      const data = await deliveryReads.overview(request.principal!.workspaceId);
      return reply.send({ data });
    },
  );

  // Server-Sent Events stream backed by a Redis Stream (XREAD BLOCK).
  r.get(
    '/explorer/stream',
    { preHandler: requireRoleAllowQueryToken(ApiKeyRole.ADMIN, ApiKeyRole.CONSUMER) },
    async (request, reply) => {
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');

      const subscriber = app.redis.duplicate();
      let closed = false;
      const lastEventIdHeader = request.headers['last-event-id'];
      let lastId =
        typeof lastEventIdHeader === 'string' && lastEventIdHeader ? lastEventIdHeader : '$';

      const heartbeat = setInterval(() => {
        if (!closed) res.write(': ping\n\n');
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        subscriber.disconnect();
        res.end();
      };
      request.raw.on('close', cleanup);
      request.raw.on('error', cleanup);

      // Read loop: block for new entries, forward as SSE frames.
      void (async () => {
        while (!closed) {
          try {
            const result = (await subscriber.xread(
              'BLOCK',
              XREAD_BLOCK_MS,
              'STREAMS',
              EXPLORER_ACTIVITY_STREAM,
              lastId,
            )) as [string, [string, string[]][]][] | null;

            if (closed) break;
            if (!result) continue;

            for (const [, entries] of result) {
              for (const [id, fields] of entries) {
                lastId = id;
                const typeIdx = fields.indexOf('type');
                const dataIdx = fields.indexOf('data');
                const type = typeIdx >= 0 ? fields[typeIdx + 1] : 'message';
                const data = dataIdx >= 0 ? fields[dataIdx + 1] : '{}';
                res.write(`event: ${type}\nid: ${id}\ndata: ${data}\n\n`);
              }
            }
          } catch (err) {
            if (closed) break;
            app.log.warn({ err }, 'explorer SSE read error');
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      })();
    },
  );
}
