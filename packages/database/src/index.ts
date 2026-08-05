export { createPrismaClient } from './client.js';
export type { PrismaClient, CreatePrismaOptions } from './client.js';
export { newId } from './id.js';

// Re-export generated Prisma enums and namespace so consumers depend only on
// @triggers/database rather than reaching into the generated client path.
export { ApiKeyRole, DeliveryStatus, Prisma } from './generated/client/index.js';
export type {
  Workspace,
  ApiKey,
  Event,
  Subscription,
  Delivery,
  AckReceipt,
  ReplayAudit,
} from './generated/client/index.js';
