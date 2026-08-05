import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, seedWorkspaceAndKeys, type SeededWorkspace } from '@triggers/test-utils';
import { buildTestApp, bearer, type TestApp } from '../helpers/build-test-app.js';

describe('ACK semantics', () => {
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
    const subRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      headers: bearer(seed.admin.token),
      payload: { name: 'all', filters: {} },
    });
    subscriptionId = subRes.json().data.id;
  });

  async function ingestAndLease(): Promise<{ deliveryId: string; leaseToken: string }> {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: { source: 's', eventType: 't', payload: {} },
    });
    const inbox = await ctx.app.inject({
      method: 'GET',
      url: `/v1/inbox?subscriptionId=${subscriptionId}`,
      headers: bearer(seed.consumer.token),
    });
    const item = inbox.json().data.items[0];
    return { deliveryId: item.deliveryId, leaseToken: item.leaseToken };
  }

  function ack(deliveryId: string, leaseToken: string, processId: string) {
    return ctx.app.inject({
      method: 'POST',
      url: `/v1/deliveries/${deliveryId}/ack`,
      headers: { ...bearer(seed.consumer.token), 'x-consumer-process-id': processId },
      payload: { leaseToken },
    });
  }

  it('is idempotent for a repeated ACK with the same process id', async () => {
    const { deliveryId, leaseToken } = await ingestAndLease();

    const first = await ack(deliveryId, leaseToken, 'proc-A');
    expect(first.statusCode).toBe(200);
    expect(first.json().data.duplicateAck).toBe(false);

    const second = await ack(deliveryId, leaseToken, 'proc-A');
    expect(second.statusCode).toBe(200);
    expect(second.json().data.duplicateAck).toBe(true);
    expect(second.json().data.acknowledgedAt).toBe(first.json().data.acknowledgedAt);

    expect(await ctx.prisma.ackReceipt.count({ where: { deliveryId } })).toBe(1);
  });

  it('returns the current acknowledged state for a different process id', async () => {
    const { deliveryId, leaseToken } = await ingestAndLease();
    const first = await ack(deliveryId, leaseToken, 'proc-A');

    const other = await ack(deliveryId, leaseToken, 'proc-B');
    expect(other.statusCode).toBe(200);
    expect(other.json().data.duplicateAck).toBe(true);
    expect(other.json().data.acknowledgedAt).toBe(first.json().data.acknowledgedAt);
  });

  it('rejects an ACK with an invalid lease token (409 LEASE_CONFLICT)', async () => {
    const { deliveryId } = await ingestAndLease();
    const res = await ack(deliveryId, 'deadbeef'.repeat(8), 'proc-A');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('LEASE_CONFLICT');
  });

  it('requires the X-Consumer-Process-ID header (400)', async () => {
    const { deliveryId, leaseToken } = await ingestAndLease();
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/deliveries/${deliveryId}/ack`,
      headers: bearer(seed.consumer.token),
      payload: { leaseToken },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
