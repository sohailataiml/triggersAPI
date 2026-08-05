import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, seedWorkspaceAndKeys, type SeededWorkspace } from '@triggers/test-utils';
import { buildTestApp, bearer, type TestApp } from '../helpers/build-test-app.js';

describe('explorer views', () => {
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
    // A wildcard subscription so every ingested event produces a delivery.
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      headers: bearer(seed.admin.token),
      payload: { name: 'sub', filters: {} },
    });
  });

  it('reports overview counts', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: { source: 'github', eventType: 'push', payload: {} },
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/explorer/overview',
      headers: bearer(seed.admin.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.totalEvents).toBe(1);
    expect(res.json().data.pending).toBe(1);
  });

  it('lists deliveries with a status filter and event summary', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: { source: 'github', eventType: 'push', subject: 'repo:x', payload: {} },
    });

    const all = await ctx.app.inject({
      method: 'GET',
      url: '/v1/deliveries',
      headers: bearer(seed.admin.token),
    });
    expect(all.json().data).toHaveLength(1);
    expect(all.json().data[0].event.source).toBe('github');

    const filtered = await ctx.app.inject({
      method: 'GET',
      url: '/v1/deliveries?status=PENDING&source=github',
      headers: bearer(seed.admin.token),
    });
    expect(filtered.json().data).toHaveLength(1);

    const none = await ctx.app.inject({
      method: 'GET',
      url: '/v1/deliveries?status=DEAD_LETTER',
      headers: bearer(seed.admin.token),
    });
    expect(none.json().data).toHaveLength(0);
  });
});
