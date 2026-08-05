import { loadConfig } from '@triggers/config';
import { createPrismaClient } from '@triggers/database';
import { createLogger, createMetrics } from '@triggers/observability';
import { buildApp } from './app.js';
import { createRedis } from './lib/redis.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL, name: 'triggers-api' });

  const prisma = createPrismaClient();
  const redis = createRedis(config.REDIS_URL);
  const metrics = createMetrics();

  const app = await buildApp({
    config,
    prisma,
    redis,
    metrics,
    logger,
    ownDependencies: true,
  });

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    logger.error({ err }, 'failed to start API');
    process.exit(1);
  }

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.info({ signal }, 'shutting down API');
      app.close().finally(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
