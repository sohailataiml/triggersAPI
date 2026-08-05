import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, seedWorkspaceAndKeys, type SeededWorkspace } from '@triggers/test-utils';
import { buildTestApp, bearer, type TestApp } from '../helpers/build-test-app.js';

describe('concurrency: no double-lease under FOR UPDATE SKIP LOCKED', () => {
  let ctx: TestApp;
  let seed: SeededWorkspace;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    seed = await seedWorkspaceAndKeys(ctx.prisma, ctx.config.API_KEY_PEPPER);
  });

  async function createSub(): Promise<string> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      headers: bearer(seed.admin.token),
      payload: { name: 'sub', filters: {} },
    });
    return res.json().data.id;
  }

  function inbox(subscriptionId: string, instance: string) {
    return ctx.app.inject({
      method: 'GET',
      url: `/v1/inbox?subscriptionId=${subscriptionId}&limit=10&consumerInstanceId=${instance}`,
      headers: bearer(seed.consumer.token),
    });
  }

  it('delivers a single event to exactly one of two concurrent consumers', async () => {
    const sub = await createSub();
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: { source: 's', eventType: 't', payload: {} },
    });

    const [a, b] = await Promise.all([inbox(sub, 'A'), inbox(sub, 'B')]);
    const itemsA = a.json().data.items as unknown[];
    const itemsB = b.json().data.items as unknown[];

    // Exactly one consumer received the single delivery.
    expect(itemsA.length + itemsB.length).toBe(1);
  });

  it('splits N events across concurrent consumers with no overlap', async () => {
    const sub = await createSub();
    const N = 20;
    for (let i = 0; i < N; i++) {
      await ctx.app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: bearer(seed.producer.token),
        payload: { source: 's', eventType: 't', payload: { i } },
      });
    }

    const results = await Promise.all([
      inbox(sub, 'A'),
      inbox(sub, 'B'),
      inbox(sub, 'C'),
      inbox(sub, 'D'),
    ]);

    const leasedIds = results.flatMap((r) =>
      (r.json().data.items as Array<{ deliveryId: string }>).map((it) => it.deliveryId),
    );

    // No delivery id was leased by more than one consumer.
    const unique = new Set(leasedIds);
    expect(unique.size).toBe(leasedIds.length);
    expect(leasedIds.length).toBeLessThanOrEqual(N);
  });
});
