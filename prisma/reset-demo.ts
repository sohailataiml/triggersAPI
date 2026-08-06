import { loadConfig } from '@triggers/config';
import { createPrismaClient } from '@triggers/database';

/**
 * Demo-safe reset: wipe all event/delivery data so the pipeline, KPIs, and
 * activity feed go back to zero, WITHOUT touching the workspace, subscriptions,
 * or API keys — so the deployed demo's baked tokens keep working.
 *
 * Also normalizes each subscription's tuning back to config defaults (undoing
 * any dead-letter demo that lowered maxAttempts). Run as a one-off job:
 *   pnpm db:reset-demo
 *
 * (This is different from `db:reset`, which drops the entire database.)
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = createPrismaClient();

  // Delete in dependency order (children first) so we don't rely on cascades.
  const acks = await prisma.ackReceipt.deleteMany({});
  const replays = await prisma.replayAudit.deleteMany({});
  const deliveries = await prisma.delivery.deleteMany({});
  const events = await prisma.event.deleteMany({});

  const subs = await prisma.subscription.updateMany({
    data: {
      maxAttempts: config.DEFAULT_MAX_ATTEMPTS,
      visibilityTimeoutSeconds: config.DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
      isActive: true,
    },
  });

  console.log(
    `Reset complete — events=${events.count} deliveries=${deliveries.count} ` +
      `ackReceipts=${acks.count} replayAudits=${replays.count} ` +
      `subscriptionsNormalized=${subs.count}. Workspace, subscriptions, and keys kept.`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('reset-demo failed', err);
  process.exit(1);
});
