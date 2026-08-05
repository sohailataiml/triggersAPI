import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, seedWorkspaceAndKeys, type SeededWorkspace } from '@triggers/test-utils';
import { buildTestApp, bearer, type TestApp } from '../helpers/build-test-app.js';

describe('event ingestion', () => {
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

  it('accepts a valid event with 201', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: { source: 'github', eventType: 'push', payload: { ref: 'main' } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe('accepted');
  });

  it('rejects an invalid payload with 400 and an error envelope', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: { eventType: 'push', payload: {} }, // missing source
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.requestId).toBeTruthy();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { source: 'x', eventType: 'y', payload: {} },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('forbids a non-producer key from ingesting', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.consumer.token),
      payload: { source: 'x', eventType: 'y', payload: {} },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('returns the original event for a duplicate idempotency key (200, duplicate=true)', async () => {
    const headers = { ...bearer(seed.producer.token), 'idempotency-key': 'evt-123' };
    const payload = { source: 'github', eventType: 'push', payload: { n: 1 } };

    const first = await ctx.app.inject({ method: 'POST', url: '/v1/events', headers, payload });
    expect(first.statusCode).toBe(201);
    const firstId = first.json().data.eventId;

    const second = await ctx.app.inject({ method: 'POST', url: '/v1/events', headers, payload });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.duplicate).toBe(true);
    expect(second.json().data.eventId).toBe(firstId);

    expect(await ctx.prisma.event.count()).toBe(1);
  });
});
