import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, seedWorkspaceAndKeys, type SeededWorkspace } from '@triggers/test-utils';
import { buildTestApp, bearer, type TestApp } from '../helpers/build-test-app.js';

describe('vertical slice: subscribe -> ingest -> lease -> ack', () => {
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

  it('completes the full delivery lifecycle and reaches ACKNOWLEDGED in Postgres', async () => {
    // 1. Create a subscription (admin).
    const subRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      headers: bearer(seed.admin.token),
      payload: {
        name: 'GitHub PRs',
        filters: { source: 'github', eventType: 'pull_request.opened' },
      },
    });
    expect(subRes.statusCode).toBe(201);
    const subscriptionId = subRes.json().data.id as string;

    // 2. Ingest a matching event (producer).
    const ingestRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: {
        source: 'github',
        eventType: 'pull_request.opened',
        subject: 'repo:acme/widgets',
        payload: { pullRequestId: 431 },
      },
    });
    expect(ingestRes.statusCode).toBe(201);
    expect(ingestRes.json().data.matchedSubscriptions).toBe(1);
    expect(ingestRes.json().data.duplicate).toBe(false);

    // 3. A pending delivery exists in Postgres.
    const pending = await ctx.prisma.delivery.findFirst({ where: { subscriptionId } });
    expect(pending?.status).toBe('PENDING');

    // 4. Lease it from the inbox (consumer).
    const inboxRes = await ctx.app.inject({
      method: 'GET',
      url: `/v1/inbox?subscriptionId=${subscriptionId}&limit=10`,
      headers: bearer(seed.consumer.token),
    });
    expect(inboxRes.statusCode).toBe(200);
    const items = inboxRes.json().data.items as Array<{
      deliveryId: string;
      leaseToken: string;
      attempt: number;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0]!.attempt).toBe(1);
    expect(items[0]!.leaseToken).toMatch(/^[0-9a-f]{64}$/);
    const { deliveryId, leaseToken } = items[0]!;

    // 5. Delivery is LEASED in Postgres.
    const leased = await ctx.prisma.delivery.findUnique({ where: { id: deliveryId } });
    expect(leased?.status).toBe('LEASED');
    expect(leased?.leaseTokenHash).toBeTruthy();

    // 6. ACK it.
    const ackRes = await ctx.app.inject({
      method: 'POST',
      url: `/v1/deliveries/${deliveryId}/ack`,
      headers: { ...bearer(seed.consumer.token), 'x-consumer-process-id': 'run-1-step-1' },
      payload: { leaseToken },
    });
    expect(ackRes.statusCode).toBe(200);
    expect(ackRes.json().data.status).toBe('acknowledged');
    expect(ackRes.json().data.duplicateAck).toBe(false);

    // 7. Final state in Postgres.
    const acked = await ctx.prisma.delivery.findUnique({ where: { id: deliveryId } });
    expect(acked?.status).toBe('ACKNOWLEDGED');
    expect(acked?.acknowledgedAt).toBeTruthy();
    expect(acked?.leaseTokenHash).toBeNull();

    const receipts = await ctx.prisma.ackReceipt.count({ where: { deliveryId } });
    expect(receipts).toBe(1);
  });

  it('does not create a delivery for a non-matching subscription', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/subscriptions',
      headers: bearer(seed.admin.token),
      payload: { name: 'Stripe only', filters: { source: 'stripe' } },
    });

    const ingestRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(seed.producer.token),
      payload: { source: 'github', eventType: 'pull_request.opened', payload: {} },
    });

    expect(ingestRes.json().data.matchedSubscriptions).toBe(0);
    expect(await ctx.prisma.delivery.count()).toBe(0);
  });
});
