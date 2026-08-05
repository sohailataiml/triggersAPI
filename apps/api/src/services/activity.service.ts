import type { Redis } from 'ioredis';
import type { Logger } from '@triggers/observability';
import type { ExplorerActivity } from '@triggers/contracts';
import { EXPLORER_ACTIVITY_STREAM, wakeupChannel } from '../lib/keys.js';

/**
 * Publishes Explorer lifecycle activity to a bounded Redis Stream and emits
 * per-subscription wake-up notifications for long polling.
 *
 * Redis is advisory here: PostgreSQL is the source of truth. Every method
 * swallows and logs Redis errors so that a Redis outage never fails an
 * already-committed database operation.
 */
export class ActivityService {
  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
    private readonly streamMaxLength: number,
  ) {}

  /** Append a lifecycle activity to the Explorer stream (best-effort). */
  async append(activity: ExplorerActivity): Promise<void> {
    try {
      await this.redis.xadd(
        EXPLORER_ACTIVITY_STREAM,
        'MAXLEN',
        '~',
        this.streamMaxLength,
        '*',
        'type',
        activity.type,
        'data',
        JSON.stringify(activity),
      );
    } catch (err) {
      this.logger.warn({ err, activityType: activity.type }, 'failed to append explorer activity');
    }
  }

  /** Publish a wake-up notification for a subscription (best-effort). */
  async publishWakeup(subscriptionId: string): Promise<void> {
    try {
      await this.redis.publish(
        wakeupChannel(subscriptionId),
        JSON.stringify({ subscriptionId, timestamp: new Date().toISOString() }),
      );
    } catch (err) {
      this.logger.warn({ err, subscriptionId }, 'failed to publish wake-up');
    }
  }
}
