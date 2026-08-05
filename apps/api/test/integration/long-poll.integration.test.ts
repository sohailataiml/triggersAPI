import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, seedWorkspaceAndKeys, type SeededWorkspace } from '@triggers/test-utils';
import { buildTestApp, bearer, type TestApp } from '../helpers/build-test-app.js';

describe('long polling', () => {
  let ctx: TestApp;
  let seed: SeededWorkspace;
  let subscriptionId: string;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    seed = await seedWorkspaceAndKeys(ctx.prisma, ctx.config.API_KEY_PEPPER);
    const sub = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      headers: bearer(seed.admin.token),
      payload: { name: 'sub', filters: {} },
    });
    subscriptionId = sub.json().data.id;
  });

  function ingest() {
    return ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: { source: 's', eventType: 't', payload: {} },
    });
  }

  function inbox(wait: number) {
    return ctx.app.inject({
      method: 'GET',
      url: `/v1/inbox?subscriptionId=${subscriptionId}&wait=${wait}`,
      headers: bearer(seed.consumer.token),
    });
  }

  it('returns immediately when an event is already available', async () => {
    await ingest();
    const start = Date.now();
    const res = await inbox(10);
    const elapsed = Date.now() - start;

    expect(res.json().data.items).toHaveLength(1);
    expect(elapsed).toBeLessThan(2000); // did not wait the full 10s
  });

  it('wakes promptly after an event is ingested during the wait', async () => {
    const start = Date.now();
    const pending = inbox(15); // begins waiting (no events yet)

    // Ingest shortly after the poll has started waiting.
    await new Promise((r) => setTimeout(r, 400));
    await ingest();

    const res = await pending;
    const elapsed = Date.now() - start;

    expect(res.json().data.items).toHaveLength(1);
    // Woke via Redis Pub/Sub well before the 15s timeout.
    expect(elapsed).toBeLessThan(5000);
  });

  it('returns an empty array when the wait times out with no events', async () => {
    const start = Date.now();
    const res = await inbox(2);
    const elapsed = Date.now() - start;

    expect(res.statusCode).toBe(200);
    expect(res.json().data.items).toHaveLength(0);
    expect(elapsed).toBeGreaterThanOrEqual(1800);
    expect(elapsed).toBeLessThan(4000);
  });

  it('leaves no active long polls after a timeout (gauge returns to zero)', async () => {
    await inbox(1);
    const metrics = await ctx.app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.body).toMatch(/triggers_long_poll_active 0/);
  });
});
