import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '@triggers/config';
import { ApiKeyRole, createPrismaClient, newId, type PrismaClient } from '@triggers/database';
import {
  generateApiKeyParts,
  hashApiKeySecret,
  parseApiKey,
  verifyApiKeySecret,
} from '@triggers/domain';

/**
 * Idempotent one-command demo provisioning.
 *
 * `db:seed` is deliberately left alone — it always mints a fresh workspace,
 * which is right for a first run but wrong for a demo you restart. This script
 * instead converges on a working state: reuse the demo workspace and any tokens
 * in `.env` that still authenticate, mint only what is missing, and write the
 * result back so no one has to copy a token by hand.
 *
 * Two details matter for the Copilot specifically:
 *  - the consumer key is created **unscoped**, because the agent creates its own
 *    subscriptions during a demo and a subscription-scoped key cannot lease from
 *    them (403);
 *  - URLs are derived from the actual API port, so a machine that already has
 *    something on :3000 stays internally consistent.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const envPath = path.join(repoRoot, '.env');
const envExamplePath = path.join(repoRoot, '.env.example');

const WORKSPACE_NAME = 'Demo Workspace';
const SUBSCRIPTION_NAME = 'GitHub pull requests';

interface Tokens {
  admin: string;
  producer: string;
  consumer: string;
}

/** Is this token still a valid, active key of the expected role in this workspace? */
async function isUsable(
  prisma: PrismaClient,
  token: string | undefined,
  role: ApiKeyRole,
  workspaceId: string,
  pepper: string,
): Promise<boolean> {
  if (!token) return false;
  const parsed = parseApiKey(token);
  if (!parsed) return false;

  const key = await prisma.apiKey.findUnique({ where: { publicPrefix: parsed.publicPrefix } });
  if (!key || !key.isActive) return false;
  if (key.workspaceId !== workspaceId || key.role !== role) return false;
  // A subscription-scoped consumer key cannot lease from subscriptions the
  // agent creates later, so treat it as unusable for the demo.
  if (role === ApiKeyRole.CONSUMER && key.subscriptionId !== null) return false;

  return verifyApiKeySecret(parsed.secret, key.secretHash, pepper);
}

async function mintKey(
  prisma: PrismaClient,
  role: ApiKeyRole,
  workspaceId: string,
  pepper: string,
): Promise<string> {
  const { publicPrefix, secret, token } = generateApiKeyParts();
  await prisma.apiKey.create({
    data: {
      id: newId(),
      workspaceId,
      role,
      name: `demo ${role.toLowerCase()} key`,
      publicPrefix,
      secretHash: hashApiKeySecret(secret, pepper),
      subscriptionId: null,
    },
  });
  return token;
}

/**
 * Is something already listening here?
 *
 * Probes by connecting rather than by binding: on Windows SO_REUSEADDR lets a
 * second socket bind a port that is already in use, so a bind test reports the
 * port free and the clash only shows up later as requests reaching the wrong
 * server.
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const settle = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(500);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

/**
 * A busy API port is worth stopping for rather than warning about: two servers
 * can end up bound to the same port on different interfaces, and requests then
 * reach whichever one `localhost` happens to resolve to. That failure looks
 * like the demo misbehaving rather than a port clash. The other services fail
 * loudly with EADDRINUSE, so a warning is enough for them.
 */
async function checkPorts(apiPort: number): Promise<void> {
  const others: Array<[number, string]> = [
    [3100, 'MCP server'],
    [3200, 'Copilot backend'],
    [5174, 'Copilot UI'],
    [5173, 'Explorer'],
  ];

  const busyOthers: string[] = [];
  for (const [port, label] of others) {
    if (await isPortInUse(port)) busyOthers.push(`${port} (${label})`);
  }
  if (busyOthers.length > 0) {
    console.log(`\n  ! Ports already in use: ${busyOthers.join(', ')}.`);
    console.log('    Stop whatever is using them, or those services will fail to start.');
  }

  if (!(await isPortInUse(apiPort))) return;

  console.error(
    `\nPort ${apiPort} is already in use, and the API needs it.\n\n` +
      `Something else on this machine is listening there. Pick a free port instead:\n\n` +
      `  1. Set PORT=3010 in .env\n` +
      `  2. Re-run: pnpm demo\n\n` +
      `Every other URL is derived from PORT, so nothing else needs changing.`,
  );
  process.exit(1);
}

/** Upsert keys in a .env file, preserving every other line and comment. */
function upsertEnv(content: string, updates: Record<string, string>): string {
  let out = content;
  const appended: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(out)) {
      out = out.replace(pattern, `${key}=${value}`);
    } else {
      appended.push(`${key}=${value}`);
    }
  }

  if (appended.length > 0) {
    out = `${out.trimEnd()}\n\n# --- Written by \`pnpm demo:setup\` ---\n${appended.join('\n')}\n`;
  }
  return out;
}

async function main(): Promise<void> {
  if (!existsSync(envPath)) {
    copyFileSync(envExamplePath, envPath);
    console.log('Created .env from .env.example');
  }

  const config = loadConfig();
  await checkPorts(config.PORT);

  const prisma = createPrismaClient();

  // --- Workspace + subscription: find or create ---
  let workspace = await prisma.workspace.findFirst({ where: { name: WORKSPACE_NAME } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: { id: newId(), name: WORKSPACE_NAME },
    });
    console.log('Created demo workspace');
  }

  const existingSubscription = await prisma.subscription.findFirst({
    where: { workspaceId: workspace.id, name: SUBSCRIPTION_NAME },
  });
  if (!existingSubscription) {
    await prisma.subscription.create({
      data: {
        id: newId(),
        workspaceId: workspace.id,
        name: SUBSCRIPTION_NAME,
        sourceFilter: 'github',
        eventTypeFilter: 'pull_request.opened',
        visibilityTimeoutSeconds: config.DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
        maxAttempts: config.DEFAULT_MAX_ATTEMPTS,
      },
    });
    console.log('Created demo subscription');
  }

  // --- Tokens: reuse what still works, mint only the rest ---
  const pepper = config.API_KEY_PEPPER;
  const current = {
    admin: process.env.TRIGGERS_ADMIN_TOKEN,
    producer: process.env.TRIGGERS_PRODUCER_TOKEN,
    consumer: process.env.TRIGGERS_CONSUMER_TOKEN,
  };

  const [adminOk, producerOk, consumerOk] = await Promise.all([
    isUsable(prisma, current.admin, ApiKeyRole.ADMIN, workspace.id, pepper),
    isUsable(prisma, current.producer, ApiKeyRole.PRODUCER, workspace.id, pepper),
    isUsable(prisma, current.consumer, ApiKeyRole.CONSUMER, workspace.id, pepper),
  ]);

  const tokens: Tokens = {
    admin: adminOk ? current.admin! : await mintKey(prisma, ApiKeyRole.ADMIN, workspace.id, pepper),
    producer: producerOk
      ? current.producer!
      : await mintKey(prisma, ApiKeyRole.PRODUCER, workspace.id, pepper),
    consumer: consumerOk
      ? current.consumer!
      : await mintKey(prisma, ApiKeyRole.CONSUMER, workspace.id, pepper),
  };

  const minted = [!adminOk && 'admin', !producerOk && 'producer', !consumerOk && 'consumer'].filter(
    Boolean,
  );
  console.log(
    minted.length > 0 ? `Minted new ${minted.join(', ')} key(s)` : 'Reused existing demo tokens',
  );

  await prisma.$disconnect();

  // --- Write everything the demo processes need, derived from the real port ---
  const apiPort = config.PORT;
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const mcpPort = process.env.MCP_HTTP_PORT ?? '3100';
  const explorerUrl = process.env.EXPLORER_URL ?? 'http://localhost:5173';

  const updates: Record<string, string> = {
    TRIGGERS_ADMIN_TOKEN: tokens.admin,
    TRIGGERS_PRODUCER_TOKEN: tokens.producer,
    TRIGGERS_CONSUMER_TOKEN: tokens.consumer,
    TRIGGERS_API_URL: apiUrl,
    MCP_SERVER_URL: `http://127.0.0.1:${mcpPort}/mcp`,
    EXPLORER_URL: explorerUrl,
    // The Explorer reads these at build/dev time to auto-connect, so the
    // grader never sees its Settings drawer either.
    VITE_API_PROXY: apiUrl,
    VITE_DEMO_ADMIN_TOKEN: tokens.admin,
    VITE_DEMO_PRODUCER_TOKEN: tokens.producer,
    VITE_DEMO_CONSUMER_TOKEN: tokens.consumer,
  };

  writeFileSync(envPath, upsertEnv(readFileSync(envPath, 'utf8'), updates), 'utf8');

  console.log('\n=== Demo ready ===');
  console.log(`  API        ${apiUrl}`);
  console.log(`  MCP        http://127.0.0.1:${mcpPort}/mcp`);
  console.log(`  Copilot    http://localhost:5174`);
  console.log(`  Explorer   ${explorerUrl}`);
  console.log('  Tokens written to .env (gitignored) — nothing to copy by hand.');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      '\n  ! ANTHROPIC_API_KEY is not set. Everything else will run, but the Copilot\n' +
        '    will show its setup screen instead of answering. Add it to .env:\n' +
        '      ANTHROPIC_API_KEY=sk-ant-...',
    );
  }
}

main().catch((error: unknown) => {
  console.error('demo setup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
