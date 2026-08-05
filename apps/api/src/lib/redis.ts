import { Redis } from 'ioredis';

/**
 * Create an ioredis connection. `maxRetriesPerRequest: null` is required for
 * BullMQ-compatible connections and keeps commands from failing fast during
 * brief blips; long-poll code treats Redis as advisory and tolerates outages.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

export type { Redis } from 'ioredis';
