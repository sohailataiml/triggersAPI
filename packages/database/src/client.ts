import { PrismaClient } from './generated/client/index.js';

export type { PrismaClient } from './generated/client/index.js';

/** Options accepted when constructing a Prisma client. */
export interface CreatePrismaOptions {
  datasourceUrl?: string;
  logQueries?: boolean;
  /** Interactive-transaction timeout in ms (default 15000). */
  transactionTimeoutMs?: number;
  /** Max time to wait for a connection before a transaction starts, ms (default 5000). */
  transactionMaxWaitMs?: number;
}

/**
 * Construct a PrismaClient. The URL defaults to the `DATABASE_URL` datasource
 * configured in the schema, but may be overridden (used by integration tests
 * that point at an isolated database).
 *
 * The interactive-transaction budget is raised well above Prisma's 5s default:
 * the ingest/lease/nack/replay transactions do several round-trips, and on a
 * loaded host (or a cold connection pool) a slow first query could otherwise
 * trip the 5s ceiling and fail the whole request. 15s is comfortably above
 * normal (<200ms) latency while still bounding a genuinely stuck transaction.
 */
export function createPrismaClient(options: CreatePrismaOptions = {}): PrismaClient {
  return new PrismaClient({
    datasourceUrl: options.datasourceUrl,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
    transactionOptions: {
      timeout: options.transactionTimeoutMs ?? 15_000,
      maxWait: options.transactionMaxWaitMs ?? 5_000,
    },
  });
}
