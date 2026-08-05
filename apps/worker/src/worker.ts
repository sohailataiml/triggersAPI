import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadConfig } from '@triggers/config';
import { createPrismaClient } from '@triggers/database';
import { createLogger } from '@triggers/observability';
import { recoverExpiredLeases } from './jobs/recover-expired-leases.job.js';

const QUEUE_NAME = 'triggers-maintenance';
const JOB_RECOVER = 'recover-expired-leases';
const RECOVER_INTERVAL_MS = 5000;

/**
 * Maintenance worker. Runs a repeatable BullMQ job that recovers expired
 * leases. PostgreSQL is authoritative; BullMQ only schedules the periodic scan.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL, name: 'triggers-worker' });

  const prisma = createPrismaClient();
  const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const activityRedis = connection.duplicate();

  const queue = new Queue(QUEUE_NAME, { connection });
  // Deterministic scheduler id avoids duplicate repeatable jobs on restart.
  await queue.upsertJobScheduler(
    JOB_RECOVER,
    { every: RECOVER_INTERVAL_MS },
    { name: JOB_RECOVER, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === JOB_RECOVER) {
        const recovered = await recoverExpiredLeases(
          prisma,
          activityRedis,
          config.EXPLORER_STREAM_MAX_LENGTH,
        );
        if (recovered > 0) {
          logger.info({ recovered }, 'recovered expired leases');
        }
        return { recovered };
      }
      return {};
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, jobName: job?.name }, 'maintenance job failed');
  });

  logger.info({ queue: QUEUE_NAME, intervalMs: RECOVER_INTERVAL_MS }, 'worker started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down');
    await worker.close();
    await queue.close();
    await prisma.$disconnect().catch(() => undefined);
    connection.disconnect();
    activityRedis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('fatal worker error', err);
  process.exit(1);
});
