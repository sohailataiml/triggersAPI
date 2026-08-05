import { PrismaClient } from './generated/client/index.js';

export type { PrismaClient } from './generated/client/index.js';

/** Options accepted when constructing a Prisma client. */
export interface CreatePrismaOptions {
  datasourceUrl?: string;
  logQueries?: boolean;
}

/**
 * Construct a PrismaClient. The URL defaults to the `DATABASE_URL` datasource
 * configured in the schema, but may be overridden (used by integration tests
 * that point at an isolated database).
 */
export function createPrismaClient(options: CreatePrismaOptions = {}): PrismaClient {
  return new PrismaClient({
    datasourceUrl: options.datasourceUrl,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}
