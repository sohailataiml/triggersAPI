import { loadConfig, type AppConfig } from '@triggers/config';
import { createPrismaClient, type PrismaClient } from '@triggers/database';
import { createLogger, createMetrics, type Metrics } from '@triggers/observability';
import type { Redis } from 'ioredis';
import { buildApp } from '../../src/app.js';
import { createRedis } from '../../src/lib/redis.js';

export type BuiltApp = Awaited<ReturnType<typeof buildApp>>;

export interface TestApp {
  app: BuiltApp;
  prisma: PrismaClient;
  redis: Redis;
  metrics: Metrics;
  config: AppConfig;
  close: () => Promise<void>;
}

/**
 * Build a fully wired app against the real Postgres/Redis containers, with a
 * silent logger and an isolated metrics registry. The caller owns cleanup.
 */
export async function buildTestApp(): Promise<TestApp> {
  const config = loadConfig();
  const logger = createLogger({ level: 'silent', name: 'test' });
  const prisma = createPrismaClient();
  const redis = createRedis(config.REDIS_URL);
  const metrics = createMetrics();

  const app = await buildApp({ config, prisma, redis, metrics, logger, ownDependencies: false });

  return {
    app,
    prisma,
    redis,
    metrics,
    config,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
    },
  };
}

/** Convenience for `Authorization: Bearer <token>` headers. */
export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
