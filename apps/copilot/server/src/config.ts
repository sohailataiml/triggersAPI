import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/** Load `.env` from the repository root when present (absent in containers). */
function loadRootDotenv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // apps/copilot/server/src -> repo root is four levels up.
  const repoRoot = path.resolve(here, '../../../..');
  loadDotenv({ path: path.join(repoRoot, '.env'), override: false });
}

/** Treat a blank or whitespace-only variable the same as an absent one. */
const optionalSecret = z.string().trim().min(1).optional().catch(undefined);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  COPILOT_HOST: z.string().min(1).default('0.0.0.0'),
  COPILOT_PORT: z.coerce.number().int().positive().max(65535).default(3200),

  /**
   * Absent is a supported state, not an error: the UI renders a setup screen
   * rather than pretending the agent works.
   */
  ANTHROPIC_API_KEY: optionalSecret,

  COPILOT_MODEL: z.string().min(1).default('claude-opus-5'),
  COPILOT_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  COPILOT_MAX_TOKENS: z.coerce.number().int().min(1024).max(128_000).default(16_000),
  /** Ceiling on tool round-trips per user message; stops runaway loops. */
  COPILOT_MAX_ITERATIONS: z.coerce.number().int().positive().max(50).default(12),

  /** The Triggers MCP server's Streamable HTTP endpoint. */
  MCP_SERVER_URL: z.string().url().default('http://127.0.0.1:3100/mcp'),

  /**
   * The Triggers REST API. Used *only* to proxy the live activity SSE stream
   * for the context panel — MCP has no streaming equivalent. Every operation
   * that changes platform state goes through MCP.
   */
  TRIGGERS_API_URL: z.string().url().default('http://127.0.0.1:3000'),

  /**
   * Forwarded to the MCP server as X-Triggers-*-Token headers (its default
   * `header` auth mode). These stay server-side; the browser never sees them.
   */
  TRIGGERS_ADMIN_TOKEN: optionalSecret,
  TRIGGERS_PRODUCER_TOKEN: optionalSecret,
  TRIGGERS_CONSUMER_TOKEN: optionalSecret,
  /** Bearer credential when the MCP server runs in `shared` auth mode. */
  MCP_HTTP_AUTH_TOKEN: optionalSecret,

  /** Base URL the Explorer is served from, for "Open in Explorer" deep links. */
  EXPLORER_URL: z.string().url().default('http://localhost:5173'),

  /** Serve the built SPA from this directory in production. */
  COPILOT_WEB_DIR: z.string().default('dist/web'),
});

export type CopilotConfig = z.infer<typeof envSchema>;

/**
 * Validate Copilot configuration, failing fast with a readable summary.
 * Deliberately does not reuse `@triggers/config`: this process never touches
 * Postgres or Redis, so requiring DATABASE_URL/REDIS_URL would be wrong.
 */
export function loadCopilotConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { useDotenv?: boolean } = {},
): CopilotConfig {
  // Pass `useDotenv: false` in tests to stay hermetic: dotenv fills any unset
  // key, so a suite that clears a variable would otherwise silently pick up
  // whatever is in the developer's .env.
  if (options.useDotenv !== false) loadRootDotenv();
  const parsed = envSchema.safeParse({ ...env, ...process.env });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid Copilot environment configuration:\n${issues}`);
  }

  return parsed.data;
}

/** True when an LLM credential is present; drives the setup state in the UI. */
export function hasLlmCredential(config: CopilotConfig): boolean {
  return Boolean(config.ANTHROPIC_API_KEY);
}
