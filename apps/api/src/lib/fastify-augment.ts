import type { PrismaClient } from '@triggers/database';
import type { Metrics } from '@triggers/observability';
import type { AppConfig } from '@triggers/config';
import type { Redis } from 'ioredis';
import type { AuthPrincipal } from '../services/auth.service.js';
import type { ActivityService } from '../services/activity.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    metrics: Metrics;
    appConfig: AppConfig;
    activity: ActivityService;
  }

  interface FastifyRequest {
    principal?: AuthPrincipal;
  }
}

export {};
