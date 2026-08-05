import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Load `.env` from the repository root if it exists. In containerized
 * environments the file is absent and variables come from the runtime, so a
 * missing file is not an error. Existing process env always takes precedence.
 */
function loadRootDotenv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // packages/config/src -> repo root is three levels up.
  const repoRoot = path.resolve(here, '../../..');
  loadDotenv({ path: path.join(repoRoot, '.env'), override: false });
}

const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  API_KEY_PEPPER: z.string().min(8, 'API_KEY_PEPPER must be at least 8 characters'),
  LEASE_TOKEN_SECRET: z.string().min(8, 'LEASE_TOKEN_SECRET must be at least 8 characters'),

  MAX_EVENT_BYTES: z.coerce.number().int().positive().default(262_144),
  MAX_LONG_POLL_SECONDS: z.coerce.number().int().positive().max(300).default(30),
  DEFAULT_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
  DEFAULT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  MAX_ACTIVE_LONG_POLLS_PER_KEY: z.coerce.number().int().positive().default(50),
  EXPLORER_STREAM_MAX_LENGTH: z.coerce.number().int().positive().default(1000),

  CORS_ORIGINS: csv.default('http://localhost:5173'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

/**
 * Validate environment configuration. Throws with a readable summary when any
 * variable is missing or malformed so the process fails fast at startup.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadRootDotenv();
  const parsed = envSchema.safeParse({ ...env, ...process.env });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}

/** Memoized config for normal application use. */
export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}
