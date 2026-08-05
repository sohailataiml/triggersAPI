import type { PrismaClient } from '@triggers/database';
import { newId, ApiKeyRole } from '@triggers/database';
import { generateApiKeyParts, hashApiKeySecret } from '@triggers/domain';

/**
 * Truncate all tables so each integration test starts from a clean slate.
 * Order-independent thanks to CASCADE.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ack_receipts", "replay_audits", "deliveries", "events", "subscriptions", "api_keys", "workspaces" RESTART IDENTITY CASCADE',
  );
}

export interface SeededKey {
  id: string;
  token: string;
  role: ApiKeyRole;
}

export interface SeededWorkspace {
  workspaceId: string;
  producer: SeededKey;
  consumer: SeededKey;
  admin: SeededKey;
}

/**
 * Create a workspace with producer, consumer, and admin API keys.
 * Returns the plaintext tokens (only available at creation time).
 * The consumer key is left workspace-scoped (subscriptionId null) so tests can
 * attach it to any subscription they create.
 */
export async function seedWorkspaceAndKeys(
  prisma: PrismaClient,
  pepper: string,
  name = 'Test Workspace',
): Promise<SeededWorkspace> {
  const workspaceId = newId();
  await prisma.workspace.create({ data: { id: workspaceId, name } });

  async function makeKey(role: ApiKeyRole): Promise<SeededKey> {
    const { publicPrefix, secret, token } = generateApiKeyParts();
    const id = newId();
    await prisma.apiKey.create({
      data: {
        id,
        workspaceId,
        role,
        name: `${role.toLowerCase()} key`,
        publicPrefix,
        secretHash: hashApiKeySecret(secret, pepper),
      },
    });
    return { id, token, role };
  }

  return {
    workspaceId,
    producer: await makeKey(ApiKeyRole.PRODUCER),
    consumer: await makeKey(ApiKeyRole.CONSUMER),
    admin: await makeKey(ApiKeyRole.ADMIN),
  };
}

/** Wait until a predicate holds or the timeout elapses (polling helper). */
export async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  { timeoutMs = 5000, intervalMs = 50 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
}
