import type { FastifyInstance } from 'fastify';

/** Liveness, readiness, and Prometheus metrics endpoints. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/live', { schema: { tags: ['health'] } }, async () => ({ status: 'ok' }));

  app.get('/health/ready', { schema: { tags: ['health'] } }, async (_request, reply) => {
    const checks: Record<string, 'ok' | 'error'> = { postgres: 'error', redis: 'error' };

    try {
      await app.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch (err) {
      app.log.warn({ err }, 'readiness: postgres check failed');
    }

    try {
      const pong = await app.redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch (err) {
      app.log.warn({ err }, 'readiness: redis check failed');
    }

    const ready = checks.postgres === 'ok' && checks.redis === 'ok';
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  });

  app.get('/metrics', { schema: { tags: ['health'] } }, async (_request, reply) => {
    // Refresh point-in-time gauges from the source of truth before serializing.
    try {
      const now = new Date();
      const [activeLeases, pending] = await Promise.all([
        app.prisma.delivery.count({ where: { status: 'LEASED', leaseUntil: { gt: now } } }),
        app.prisma.delivery.count({
          where: { status: { in: ['PENDING', 'RETRY_SCHEDULED'] }, availableAt: { lte: now } },
        }),
      ]);
      app.metrics.activeLeases.set(activeLeases);
      app.metrics.pendingDeliveries.set(pending);
    } catch (err) {
      app.log.warn({ err }, 'failed to refresh gauge metrics');
    }

    reply.header('Content-Type', app.metrics.registry.contentType);
    return app.metrics.registry.metrics();
  });
}
