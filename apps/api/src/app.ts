import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppConfig } from '@triggers/config';
import type { PrismaClient } from '@triggers/database';
import type { Metrics, Logger } from '@triggers/observability';
import type { Redis } from 'ioredis';

import './lib/fastify-augment.js';
import errorHandler from './plugins/error-handler.js';
import swaggerPlugin from './plugins/swagger.js';
import { healthRoutes } from './routes/health.routes.js';
import { registerV1Routes } from './routes/index.js';
import { ActivityService } from './services/activity.service.js';

export interface BuildAppDeps {
  config: AppConfig;
  prisma: PrismaClient;
  redis: Redis;
  metrics: Metrics;
  logger: Logger;
  /** When true, the app disconnects prisma/redis on close (owns them). */
  ownDependencies?: boolean;
}

/** Compose the Fastify application from injectable dependencies. */
export async function buildApp(deps: BuildAppDeps) {
  const { config, prisma, redis, metrics, logger } = deps;

  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: config.MAX_EVENT_BYTES,
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      return typeof header === 'string' && header.length > 0 ? header : `req_${randomUUID()}`;
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Decorate shared dependencies.
  app.decorate('appConfig', config);
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);
  app.decorate('metrics', metrics);
  app.decorate('activity', new ActivityService(redis, logger, config.EXPLORER_STREAM_MAX_LENGTH));

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.CORS_ORIGINS, credentials: true });

  await app.register(errorHandler);
  await app.register(swaggerPlugin);

  // Routes.
  await app.register(healthRoutes);
  await app.register(registerV1Routes, { prefix: '/v1' });

  if (deps.ownDependencies) {
    app.addHook('onClose', async () => {
      await prisma.$disconnect().catch(() => undefined);
      redis.disconnect();
    });
  }

  await app.ready();
  return app;
}
