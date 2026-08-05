import { loadConfig } from '@triggers/config';
import { createLogger } from '@triggers/observability';

/**
 * Worker entrypoint. Phase 2 provides the bootstrap; scheduled maintenance
 * jobs (expired-lease recovery, retry reconciliation, retention cleanup) are
 * registered here in Phase 4.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.LOG_LEVEL, name: 'triggers-worker' });

  logger.info('worker starting');

  // Phase 4 will attach BullMQ workers and repeatable schedulers here.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'worker shutting down');
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('worker started (no jobs registered yet)');
}

main().catch((err) => {
  console.error('fatal worker error', err);
  process.exit(1);
});
