import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, seedWorkspaceAndKeys, type SeededWorkspace } from '@triggers/test-utils';
import { buildTestApp, bearer, type TestApp } from '../helpers/build-test-app.js';

describe('reliability: NACK, retry, dead-letter, replay, lease expiry', () => {
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

  async function createSub(maxAttempts?: number): Promise<string> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      headers: bearer(seed.admin.token),
      payload: { name: 'sub', filters: {}, ...(maxAttempts ? { maxAttempts } : {}) },
    });
    return res.json().data.id;
  }

  async function ingest(): Promise<void> {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: { source: 's', eventType: 't', payload: {} },
    });
  }

  async function leaseOne(
    subscriptionId: string,
    visibilityTimeout?: number,
  ): Promise<{ deliveryId: string; leaseToken: string }> {
    const vt = visibilityTimeout ? `&visibilityTimeout=${visibilityTimeout}` : '';
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/v1/inbox?subscriptionId=${subscriptionId}${vt}`,
      headers: bearer(seed.consumer.token),
    });
    const item = res.json().data.items[0];
    return { deliveryId: item.deliveryId, leaseToken: item.leaseToken };
  }

  function nack(deliveryId: string, leaseToken: string) {
    return ctx.app.inject({
      method: 'POST',
      url: `/v1/deliveries/${deliveryId}/nack`,
      headers: bearer(seed.consumer.token),
      payload: { leaseToken, reason: 'processing_failed' },
    });
  }

  it('NACK schedules an exponential-backoff retry when attempts remain', async () => {
    const sub = await createSub();
    await ingest();
    const { deliveryId, leaseToken } = await leaseOne(sub);

    const res = await nack(deliveryId, leaseToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('RETRY_SCHEDULED');

    const row = await ctx.prisma.delivery.findUnique({ where: { id: deliveryId } });
    expect(row?.status).toBe('RETRY_SCHEDULED');
    expect(row?.leaseTokenHash).toBeNull();
    // First retry base delay is 5s -> availableAt must be in the future.
    expect(row!.availableAt.getTime()).toBeGreaterThan(Date.now() + 1000);
    expect(row?.lastErrorCode).toBe('processing_failed');
  });

  it('moves a delivery to DEAD_LETTER once attempts are exhausted', async () => {
    const sub = await createSub(1); // maxAttempts = 1
    await ingest();
    const { deliveryId, leaseToken } = await leaseOne(sub); // attempt = 1

    const res = await nack(deliveryId, leaseToken);
    expect(res.json().data.status).toBe('DEAD_LETTER');

    const row = await ctx.prisma.delivery.findUnique({ where: { id: deliveryId } });
    expect(row?.status).toBe('DEAD_LETTER');
    expect(row?.deadLetteredAt).toBeTruthy();
  });

  it('replays a dead-letter delivery back to PENDING with an audit record', async () => {
    const sub = await createSub(1);
    await ingest();
    const { deliveryId, leaseToken } = await leaseOne(sub);
    await nack(deliveryId, leaseToken); // -> DEAD_LETTER

    const replayRes = await ctx.app.inject({
      method: 'POST',
      url: `/v1/deliveries/${deliveryId}/replay`,
      headers: bearer(seed.admin.token),
      payload: { reason: 'downstream fixed' },
    });
    expect(replayRes.statusCode).toBe(200);
    expect(replayRes.json().data.status).toBe('PENDING');
    expect(replayRes.json().data.replayCount).toBe(1);

    const row = await ctx.prisma.delivery.findUnique({ where: { id: deliveryId } });
    expect(row?.status).toBe('PENDING');
    expect(row?.attemptCount).toBe(0);
    expect(row?.deadLetteredAt).toBeNull();
    expect(await ctx.prisma.replayAudit.count({ where: { deliveryId } })).toBe(1);

    // The replayed delivery can be leased again.
    const released = await leaseOne(sub);
    expect(released.deliveryId).toBe(deliveryId);
  });

  it('rejects replay of a non-dead-letter delivery (409 INVALID_STATE)', async () => {
    const sub = await createSub();
    await ingest();
    const { deliveryId } = await leaseOne(sub); // LEASED, not DEAD_LETTER

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/deliveries/${deliveryId}/replay`,
      headers: bearer(seed.admin.token),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INVALID_STATE');
  });

  it('replay is idempotent for a repeated Idempotency-Key', async () => {
    const sub = await createSub(1);
    await ingest();
    const { deliveryId, leaseToken } = await leaseOne(sub);
    await nack(deliveryId, leaseToken);

    const headers = { ...bearer(seed.admin.token), 'idempotency-key': 'replay-1' };
    const first = await ctx.app.inject({
      method: 'POST',
      url: `/v1/deliveries/${deliveryId}/replay`,
      headers,
      payload: {},
    });
    const second = await ctx.app.inject({
      method: 'POST',
      url: `/v1/deliveries/${deliveryId}/replay`,
      headers,
      payload: {},
    });
    expect(first.json().data.replayCount).toBe(1);
    expect(second.json().data.replayCount).toBe(1); // not incremented again

    expect(await ctx.prisma.replayAudit.count({ where: { deliveryId } })).toBe(1);
  });

  it('redelivers after lease expiry (defensive recovery on next inbox poll)', async () => {
    const sub = await createSub();
    await ingest();

    const first = await leaseOne(sub, 1); // 1s visibility timeout
    await new Promise((r) => setTimeout(r, 1300));

    // Same delivery becomes leasable again; attempt increments to 2.
    const second = await leaseOne(sub);
    expect(second.deliveryId).toBe(first.deliveryId);

    const row = await ctx.prisma.delivery.findUnique({ where: { id: first.deliveryId } });
    expect(row?.attemptCount).toBe(2);
  });
});
