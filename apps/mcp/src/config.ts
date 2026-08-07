import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Load `.env` from the repository root when present. Containerized runs supply
 * variables through the environment instead, so a missing file is not an error.
 * Existing process env always wins.
 */
function loadRootDotenv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // apps/mcp/src -> repo root is three levels up.
  const repoRoot = path.resolve(here, '../../..');
  loadDotenv({ path: path.join(repoRoot, '.env'), override: false });
}

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0),
);

const optionalToken = z
  .string()
  .trim()
  .min(1)
  .optional()
  // Treat an empty/whitespace-only variable the same as an absent one, so a
  // blank line in a `.env` file does not register a role with no credential.
  .catch(undefined);

/**
 * The long-poll ceiling the API enforces is 30s; the client timeout must exceed
 * it or every `lease_deliveries` call with `wait=30` would abort in flight.
 */
const MIN_REQUEST_TIMEOUT_MS = 35_000;

const envSchema = z.object({
  TRIGGERS_API_URL: z.string().url().default('http://localhost:3000'),

  TRIGGERS_ADMIN_TOKEN: optionalToken,
  TRIGGERS_PRODUCER_TOKEN: optionalToken,
  TRIGGERS_CONSUMER_TOKEN: optionalToken,

  TRIGGERS_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(MIN_REQUEST_TIMEOUT_MS)
    .max(300_000)
    .default(45_000),

  /** Exposes the destructive workspace-reset tool. Off unless explicitly enabled. */
  TRIGGERS_MCP_ENABLE_RESET: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  MCP_HTTP_HOST: z.string().min(1).default('0.0.0.0'),
  MCP_HTTP_PORT: z.coerce.number().int().positive().max(65535).default(3100),

  /**
   * `header` — every session supplies its own Triggers keys via `X-Triggers-*-Token`
   * headers and the server stores no credentials (default, multi-tenant safe).
   * `shared` — callers present `MCP_HTTP_AUTH_TOKEN` and the server uses its own
   * env keys. Intended for a single-operator deployment.
   */
  MCP_HTTP_AUTH_MODE: z.enum(['header', 'shared']).default('header'),
  MCP_HTTP_AUTH_TOKEN: optionalToken,

  /** DNS-rebinding protection; enforced only when non-empty. */
  MCP_ALLOWED_HOSTS: csv.default(''),
  MCP_ALLOWED_ORIGINS: csv.default(''),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type McpConfig = z.infer<typeof envSchema>;

/**
 * Validate MCP server configuration, failing fast with a readable summary.
 * Deliberately does not reuse `@triggers/config`: this process never touches
 * Postgres or Redis, so requiring DATABASE_URL/REDIS_URL would be wrong.
 */
export function loadMcpConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { useDotenv?: boolean } = {},
): McpConfig {
  // Tests pass `useDotenv: false` so they are hermetic: without it, dotenv
  // re-injects any variable the test just cleared (it fills unset keys), and
  // the suite silently depends on what happens to be in the developer's .env.
  if (options.useDotenv !== false) loadRootDotenv();
  const parsed = envSchema.safeParse({ ...env, ...process.env });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid MCP environment configuration:\n${issues}`);
  }

  return parsed.data;
}
