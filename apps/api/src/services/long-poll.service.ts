import type { Redis } from 'ioredis';
import type { Metrics } from '@triggers/observability';
import type { InboxItem } from '@triggers/contracts';
import { longPollCounterKey, wakeupChannel } from '../lib/keys.js';

/** Minimal logger shape (satisfied by both Pino and Fastify loggers). */
interface PollLogger {
  warn(obj: unknown, msg?: string): void;
}

/** Attempts one lease pass; returns leased items (possibly empty). */
export type LeaseAttempt = () => Promise<InboxItem[]>;

export interface LongPollParams {
  subscriptionId: string;
  apiKeyPrefix: string;
  waitSeconds: number;
  maxActivePerKey: number;
  attempt: LeaseAttempt;
  signal: AbortSignal;
}

const POLL_FALLBACK_INTERVAL_MS = 1000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Long-poll coordinator implementing the query → subscribe → query → wait →
 * query sequence. The second query closes the race where an event is inserted
 * after the first query but before the Redis subscription is active.
 *
 * Redis is advisory: if Pub/Sub is unavailable the poll degrades to periodic
 * database polling, so accepted events are still delivered (just less promptly).
 */
export class LongPollService {
  constructor(
    private readonly redis: Redis,
    private readonly metrics: Metrics,
    private readonly logger: PollLogger,
  ) {}

  async poll(params: LongPollParams): Promise<InboxItem[]> {
    const { attempt, waitSeconds } = params;

    // 1. Immediate query.
    const first = await attempt();
    if (first.length > 0 || waitSeconds <= 0) {
      return first;
    }

    // Resource protection: cap concurrent long polls per API key.
    const withinLimit = await this.tryReserveSlot(params.apiKeyPrefix, params.maxActivePerKey);
    if (!withinLimit) {
      return [];
    }

    const stopTimer = this.metrics.longPollWaitSeconds.startTimer();
    this.metrics.longPollActive.inc();
    try {
      return await this.waitAndLease(params);
    } finally {
      this.metrics.longPollActive.dec();
      stopTimer();
      await this.releaseSlot(params.apiKeyPrefix);
    }
  }

  private async waitAndLease(params: LongPollParams): Promise<InboxItem[]> {
    const { subscriptionId, waitSeconds, attempt } = params;
    const waitMs = waitSeconds * 1000;

    let subscriber: Redis | null = null;
    try {
      subscriber = this.redis.duplicate();
      await subscriber.subscribe(wakeupChannel(subscriptionId));
    } catch (err) {
      // Redis Pub/Sub unavailable: degrade to periodic polling.
      this.logger.warn({ err, subscriptionId }, 'long-poll subscribe failed; falling back to poll');
      if (subscriber) subscriber.disconnect();
      return this.fallbackPoll(params, waitMs);
    }

    try {
      // 2. Re-query after subscribing (missed-wake-up protection).
      const second = await attempt();
      if (second.length > 0) return second;

      // 3. Wait for a wake-up, timeout, or client disconnect.
      await this.waitForSignal(subscriber, waitMs, params.signal);

      // 4. Final query.
      return await attempt();
    } finally {
      try {
        await subscriber.unsubscribe(wakeupChannel(subscriptionId));
      } catch {
        // ignore
      }
      subscriber.disconnect();
    }
  }

  private waitForSignal(subscriber: Redis, waitMs: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        subscriber.off('message', onMessage);
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve();
      };
      const onMessage = () => done();
      const onAbort = () => done();
      const timer = setTimeout(done, waitMs);

      subscriber.on('message', onMessage);
      if (signal.aborted) {
        done();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async fallbackPoll(params: LongPollParams, waitMs: number): Promise<InboxItem[]> {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline && !params.signal.aborted) {
      const remaining = deadline - Date.now();
      await sleep(Math.min(POLL_FALLBACK_INTERVAL_MS, remaining), params.signal);
      if (params.signal.aborted) break;
      const items = await params.attempt();
      if (items.length > 0) return items;
    }
    return [];
  }

  private async tryReserveSlot(apiKeyPrefix: string, max: number): Promise<boolean> {
    try {
      const key = longPollCounterKey(apiKeyPrefix);
      const count = await this.redis.incr(key);
      // Keep the counter from leaking if a decrement is ever missed.
      await this.redis.expire(key, 60);
      if (count > max) {
        await this.redis.decr(key);
        return false;
      }
      return true;
    } catch {
      // If Redis is unavailable we cannot enforce the limit; allow the poll.
      return true;
    }
  }

  private async releaseSlot(apiKeyPrefix: string): Promise<void> {
    try {
      await this.redis.decr(longPollCounterKey(apiKeyPrefix));
    } catch {
      // best-effort
    }
  }
}
