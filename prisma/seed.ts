import { loadConfig } from '@triggers/config';
import { ApiKeyRole, createPrismaClient, newId } from '@triggers/database';
import { generateApiKeyParts, hashApiKeySecret } from '@triggers/domain';

/**
 * Seed a demo workspace with a subscription and producer/consumer/admin keys.
 * Prints the plaintext tokens (only available at creation time) for local use.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = createPrismaClient();

  const workspaceId = newId();
  await prisma.workspace.create({ data: { id: workspaceId, name: 'Demo Workspace' } });

  const subscriptionId = newId();
  await prisma.subscription.create({
    data: {
      id: subscriptionId,
      workspaceId,
      name: 'GitHub pull requests',
      sourceFilter: 'github',
      eventTypeFilter: 'pull_request.opened',
      visibilityTimeoutSeconds: config.DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
      maxAttempts: config.DEFAULT_MAX_ATTEMPTS,
    },
  });

  async function makeKey(role: ApiKeyRole, scopedSubscriptionId?: string): Promise<string> {
    const { publicPrefix, secret, token } = generateApiKeyParts();
    await prisma.apiKey.create({
      data: {
        id: newId(),
        workspaceId,
        role,
        name: `${role.toLowerCase()} key`,
        publicPrefix,
        secretHash: hashApiKeySecret(secret, config.API_KEY_PEPPER),
        subscriptionId: scopedSubscriptionId ?? null,
      },
    });
    return token;
  }

  const producerToken = await makeKey(ApiKeyRole.PRODUCER);
  const consumerToken = await makeKey(ApiKeyRole.CONSUMER, subscriptionId);
  const adminToken = await makeKey(ApiKeyRole.ADMIN);

  await prisma.$disconnect();

  console.log('\n=== TriggersAPI seed complete ===');
  console.log('workspaceId    :', workspaceId);
  console.log('subscriptionId :', subscriptionId);
  console.log('PRODUCER token :', producerToken);
  console.log('CONSUMER token :', consumerToken, '(scoped to the subscription above)');
  console.log('ADMIN token    :', adminToken);
  console.log('\nExample:');
  console.log(
    `  curl -X POST http://localhost:3000/v1/events -H "Authorization: Bearer ${producerToken}" \\`,
  );
  console.log(
    '    -H "Content-Type: application/json" -d \'{"source":"github","eventType":"pull_request.opened","payload":{"pr":1}}\'',
  );
}

main().catch((err) => {
  console.error('seed failed', err);
  process.exit(1);
});
