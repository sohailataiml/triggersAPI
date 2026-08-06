import { ApiKeyRole, createPrismaClient } from '@triggers/database';

/**
 * Make every CONSUMER API key workspace-wide (subscriptionId = null) so a demo
 * consumer can lease any subscription, not just the one it was seeded against.
 * Run as a one-off job: `pnpm db:unscope`.
 */
async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const result = await prisma.apiKey.updateMany({
    where: { role: ApiKeyRole.CONSUMER },
    data: { subscriptionId: null },
  });
  console.log(`Un-scoped ${result.count} consumer key(s) to workspace-wide.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('unscope failed', err);
  process.exit(1);
});
