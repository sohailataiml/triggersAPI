import { describe, expect, it, vi } from 'vitest';
import { SCENARIOS, type ScenarioContext } from './scenarios';
import type { ApiClient } from '../../api';
import type { Subscription } from '../../types';

const SUB: Subscription = {
  id: 'sub-1',
  name: 'GitHub PRs',
  filters: { source: 'github', eventType: 'pull_request.opened', subject: null },
  isActive: true,
  visibilityTimeoutSeconds: 30,
  maxAttempts: 5,
  createdAt: '2026-08-06T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
};

function leasedItem() {
  return {
    deliveryId: 'dlv-1',
    eventId: 'evt-1',
    leaseToken: 'lt-1',
    leaseUntil: new Date(Date.now() + 30000).toISOString(),
    attempt: 1,
    event: {
      source: 'github',
      eventType: 'pull_request.opened',
      subject: null,
      payload: {},
      receivedAt: '2026-08-06T00:00:00.000Z',
    },
  };
}

/** Minimal harness: run steps immediately, record their labels. */
function makeCtx(api: Partial<ApiClient>) {
  const steps: string[] = [];
  const ctx: ScenarioContext = {
    api: api as ApiClient,
    sub: { ...SUB },
    step: async (text, fn) => {
      steps.push(text);
      return fn();
    },
    note: () => {},
    sleep: async () => {},
    onChange: () => {},
  };
  return { ctx, steps };
}

describe('demo scenarios', () => {
  it('A: ingests, leases, then acknowledges (in order)', async () => {
    const ingest = vi
      .fn()
      .mockResolvedValue({ eventId: 'evt-1', duplicate: false, matchedSubscriptions: 1 });
    const lease = vi.fn().mockResolvedValue({ items: [leasedItem()], nextPollAfterMs: 0 });
    const ack = vi.fn().mockResolvedValue({ duplicateAck: false, acknowledgedAt: 'now' });
    const { ctx, steps } = makeCtx({ ingest, lease, ack });

    await SCENARIOS[0].run(ctx);

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(lease).toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith('dlv-1', 'lt-1', 'demo-dlv-1');
    expect(steps).toEqual([
      'Ingest a matching event',
      'Consumer leases the delivery',
      'Consumer acknowledges',
    ]);
  });

  it('C: forces a dead-letter, replays, and restores maxAttempts', async () => {
    const updateSubscription = vi.fn().mockResolvedValue(SUB);
    const ingest = vi
      .fn()
      .mockResolvedValue({ eventId: 'evt-1', duplicate: false, matchedSubscriptions: 1 });
    const lease = vi.fn().mockResolvedValue({ items: [leasedItem()], nextPollAfterMs: 0 });
    const nack = vi.fn().mockResolvedValue({ status: 'DEAD_LETTER' });
    const replay = vi.fn().mockResolvedValue({});
    const { ctx } = makeCtx({ updateSubscription, ingest, lease, nack, replay });

    await SCENARIOS[2].run(ctx);

    // maxAttempts is set to 1, then restored to the original (5).
    expect(updateSubscription).toHaveBeenNthCalledWith(1, 'sub-1', { maxAttempts: 1 });
    expect(updateSubscription).toHaveBeenLastCalledWith('sub-1', { maxAttempts: 5 });
    expect(nack).toHaveBeenCalledWith('dlv-1', 'lt-1', 'demo_failure');
    expect(replay).toHaveBeenCalledWith('dlv-1', 'Guided demo replay');
  });

  it('restores maxAttempts even if replay fails (cleanup in finally)', async () => {
    const updateSubscription = vi.fn().mockResolvedValue(SUB);
    const ingest = vi
      .fn()
      .mockResolvedValue({ eventId: 'evt-1', duplicate: false, matchedSubscriptions: 1 });
    const lease = vi.fn().mockResolvedValue({ items: [leasedItem()], nextPollAfterMs: 0 });
    const nack = vi.fn().mockResolvedValue({ status: 'DEAD_LETTER' });
    const replay = vi.fn().mockRejectedValue(new Error('boom'));
    const { ctx } = makeCtx({ updateSubscription, ingest, lease, nack, replay });

    await expect(SCENARIOS[2].run(ctx)).rejects.toThrow('boom');
    expect(updateSubscription).toHaveBeenLastCalledWith('sub-1', { maxAttempts: 5 });
  });
});
