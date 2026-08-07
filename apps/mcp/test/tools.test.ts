import { afterEach, describe, expect, it } from 'vitest';
import {
  apiError,
  callTool,
  connectHarness,
  envelope,
  resultText,
  stubFetch,
  toolNames,
  type Harness,
} from './helpers/harness.js';
import * as fixtures from './helpers/fixtures.js';

const ADMIN_ONLY = { admin: 'admin-token' };
const PRODUCER_ONLY = { producer: 'producer-token' };
const CONSUMER_ONLY = { consumer: 'consumer-token' };
const ALL_ROLES = { admin: 'admin-token', producer: 'producer-token', consumer: 'consumer-token' };

let harness: Harness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('role-gated tool registration', () => {
  it('registers only ingest_event for a producer key', async () => {
    harness = await connectHarness({ tokens: PRODUCER_ONLY });
    expect(await toolNames(harness.client)).toEqual(['ingest_event']);
  });

  it('registers the consume loop for a consumer key', async () => {
    harness = await connectHarness({ tokens: CONSUMER_ONLY });
    expect(await toolNames(harness.client)).toEqual([
      'ack_delivery',
      'get_overview',
      'get_subscription',
      'lease_deliveries',
      'list_deliveries',
      'list_events',
      'list_subscriptions',
      'nack_delivery',
    ]);
  });

  it('does not expose consumer or producer tools to an admin key', async () => {
    harness = await connectHarness({ tokens: ADMIN_ONLY });
    const names = await toolNames(harness.client);

    expect(names).toContain('replay_delivery');
    expect(names).toContain('get_delivery');
    expect(names).not.toContain('ingest_event');
    expect(names).not.toContain('ack_delivery');
    expect(names).not.toContain('lease_deliveries');
  });

  it('registers the full surface when every role is configured', async () => {
    harness = await connectHarness({ tokens: ALL_ROLES });
    expect(await toolNames(harness.client)).toEqual([
      'ack_delivery',
      'create_subscription',
      'delete_subscription',
      'get_delivery',
      'get_overview',
      'get_subscription',
      'ingest_event',
      'lease_deliveries',
      'list_deliveries',
      'list_events',
      'list_subscriptions',
      'nack_delivery',
      'replay_delivery',
      'update_subscription',
    ]);
  });

  it('hides the destructive reset tool unless it is explicitly enabled', async () => {
    harness = await connectHarness({ tokens: ADMIN_ONLY });
    expect(await toolNames(harness.client)).not.toContain('reset_workspace');
  });

  it('exposes reset_workspace when enabled, marked destructive', async () => {
    harness = await connectHarness({ tokens: ADMIN_ONLY, enableReset: true });
    const { tools } = await harness.client.listTools();
    const reset = tools.find((tool) => tool.name === 'reset_workspace');

    expect(reset).toBeDefined();
    expect(reset?.annotations?.destructiveHint).toBe(true);
  });

  it('refuses to build a server with no credentials at all', async () => {
    await expect(connectHarness({ tokens: {} })).rejects.toThrow(/No Triggers API tokens/);
  });
});

describe('ingest_event', () => {
  it('posts the event and returns the structured response', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.ingestResponse));
    harness = await connectHarness({ tokens: PRODUCER_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'ingest_event', {
      source: 'github',
      eventType: 'pull_request.opened',
      subject: 'repo:acme/widgets',
      payload: { pullRequestId: 431 },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(fixtures.ingestResponse);

    const call = fetchStub.last();
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/v1/events');
    expect(call.headers.Authorization).toBe('Bearer producer-token');
    expect(call.body).toMatchObject({ source: 'github', payload: { pullRequestId: 431 } });
  });

  it('forwards idempotencyKey as the Idempotency-Key header, not in the body', async () => {
    const fetchStub = stubFetch(() => envelope({ ...fixtures.ingestResponse, duplicate: true }));
    harness = await connectHarness({ tokens: PRODUCER_ONLY, fetchImpl: fetchStub.impl });

    await callTool(harness.client, 'ingest_event', {
      source: 'github',
      eventType: 'pull_request.opened',
      payload: {},
      idempotencyKey: 'gh-pr-431',
    });

    const call = fetchStub.last();
    expect(call.headers['Idempotency-Key']).toBe('gh-pr-431');
    expect(call.body).not.toHaveProperty('idempotencyKey');
  });

  it('sends no Idempotency-Key header when none was supplied', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.ingestResponse));
    harness = await connectHarness({ tokens: PRODUCER_ONLY, fetchImpl: fetchStub.impl });

    await callTool(harness.client, 'ingest_event', {
      source: 'github',
      eventType: 'x',
      payload: {},
    });

    expect(fetchStub.last().headers['Idempotency-Key']).toBeUndefined();
  });
});

describe('lease_deliveries', () => {
  it('leases and reports a count alongside the items', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.inboxResponse));
    harness = await connectHarness({ tokens: CONSUMER_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'lease_deliveries', {
      subscriptionId: fixtures.SUBSCRIPTION_ID,
      wait: 5,
      limit: 3,
    });

    expect(result.structuredContent).toMatchObject({ count: 1, nextPollAfterMs: 0 });

    const call = fetchStub.last();
    expect(call.path).toContain(`subscriptionId=${fixtures.SUBSCRIPTION_ID}`);
    expect(call.path).toContain('wait=5');
    expect(call.path).toContain('limit=3');
  });

  it('tags the lease with a session-derived consumerInstanceId by default', async () => {
    const fetchStub = stubFetch(() => envelope({ items: [], nextPollAfterMs: 0 }));
    harness = await connectHarness({ tokens: CONSUMER_ONLY, fetchImpl: fetchStub.impl });

    await callTool(harness.client, 'lease_deliveries', {
      subscriptionId: fixtures.SUBSCRIPTION_ID,
    });

    expect(fetchStub.last().path).toContain('consumerInstanceId=mcp%3Atest-session');
  });

  it('treats an empty inbox as a successful result, not an error', async () => {
    const fetchStub = stubFetch(() => envelope({ items: [], nextPollAfterMs: 0 }));
    harness = await connectHarness({ tokens: CONSUMER_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'lease_deliveries', {
      subscriptionId: fixtures.SUBSCRIPTION_ID,
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ count: 0, items: [], nextPollAfterMs: 0 });
  });
});

describe('ack_delivery and nack_delivery', () => {
  it('derives a stable X-Consumer-Process-ID from the session and delivery', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.ackResponse));
    harness = await connectHarness({ tokens: CONSUMER_ONLY, fetchImpl: fetchStub.impl });

    await callTool(harness.client, 'ack_delivery', {
      deliveryId: fixtures.DELIVERY_ID,
      leaseToken: 'lease_abc123',
    });

    const call = fetchStub.last();
    expect(call.path).toBe(`/v1/deliveries/${fixtures.DELIVERY_ID}/ack`);
    expect(call.headers['X-Consumer-Process-ID']).toBe(`mcp:test-session:${fixtures.DELIVERY_ID}`);
    expect(call.body).toEqual({ leaseToken: 'lease_abc123' });
  });

  it('honours an explicit consumerProcessId', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.ackResponse));
    harness = await connectHarness({ tokens: CONSUMER_ONLY, fetchImpl: fetchStub.impl });

    await callTool(harness.client, 'ack_delivery', {
      deliveryId: fixtures.DELIVERY_ID,
      leaseToken: 'lease_abc123',
      consumerProcessId: 'agent-run-73-step-4',
    });

    expect(fetchStub.last().headers['X-Consumer-Process-ID']).toBe('agent-run-73-step-4');
  });

  it('passes the failure reason through on nack', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.nackResponse));
    harness = await connectHarness({ tokens: CONSUMER_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'nack_delivery', {
      deliveryId: fixtures.DELIVERY_ID,
      leaseToken: 'lease_abc123',
      reason: 'downstream_unavailable',
      message: 'CRM 503',
    });

    expect(result.structuredContent).toMatchObject({ status: 'RETRY_SCHEDULED', attempt: 2 });
    expect(fetchStub.last().body).toEqual({
      leaseToken: 'lease_abc123',
      reason: 'downstream_unavailable',
      message: 'CRM 503',
    });
  });
});

describe('admin tools', () => {
  it('creates a subscription', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.subscription));
    harness = await connectHarness({ tokens: ADMIN_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'create_subscription', {
      name: 'GitHub pull requests',
      filters: { source: 'github', eventType: 'pull_request.opened' },
    });

    expect(result.structuredContent).toEqual(fixtures.subscription);
    expect(fetchStub.last().method).toBe('POST');
    expect(fetchStub.last().path).toBe('/v1/subscriptions');
  });

  it('patches only the supplied fields and keeps the id out of the body', async () => {
    const fetchStub = stubFetch(() => envelope({ ...fixtures.subscription, isActive: false }));
    harness = await connectHarness({ tokens: ADMIN_ONLY, fetchImpl: fetchStub.impl });

    await callTool(harness.client, 'update_subscription', {
      subscriptionId: fixtures.SUBSCRIPTION_ID,
      isActive: false,
    });

    const call = fetchStub.last();
    expect(call.method).toBe('PATCH');
    expect(call.path).toBe(`/v1/subscriptions/${fixtures.SUBSCRIPTION_ID}`);
    expect(call.body).toEqual({ isActive: false });
  });

  it('deletes a subscription and echoes the id back', async () => {
    const fetchStub = stubFetch(() => envelope({ deleted: true }));
    harness = await connectHarness({ tokens: ADMIN_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'delete_subscription', {
      subscriptionId: fixtures.SUBSCRIPTION_ID,
    });

    expect(result.structuredContent).toEqual({
      subscriptionId: fixtures.SUBSCRIPTION_ID,
      deleted: true,
    });
    expect(fetchStub.last().method).toBe('DELETE');
  });

  it('replays a dead-letter delivery with an idempotency key', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.replayResponse));
    harness = await connectHarness({ tokens: ADMIN_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'replay_delivery', {
      deliveryId: fixtures.DELIVERY_ID,
      reason: 'Downstream integration repaired',
      idempotencyKey: 'replay-req-1',
    });

    expect(result.structuredContent).toEqual(fixtures.replayResponse);
    const call = fetchStub.last();
    expect(call.headers['Idempotency-Key']).toBe('replay-req-1');
    expect(call.body).toEqual({ reason: 'Downstream integration repaired' });
  });

  it('returns full delivery detail', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.deliveryDetail));
    harness = await connectHarness({ tokens: ADMIN_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'get_delivery', {
      deliveryId: fixtures.DELIVERY_ID,
    });

    expect(result.structuredContent).toEqual(fixtures.deliveryDetail);
  });

  it('lists deliveries with filters applied', async () => {
    const fetchStub = stubFetch(() => envelope([fixtures.deliveryListItem]));
    harness = await connectHarness({ tokens: ADMIN_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'list_deliveries', { status: 'DEAD_LETTER' });

    expect(result.structuredContent).toMatchObject({ count: 1 });
    expect(fetchStub.last().path).toContain('status=DEAD_LETTER');
  });

  it('lists events with the per-status rollup', async () => {
    const fetchStub = stubFetch(() => envelope([fixtures.eventListItem]));
    harness = await connectHarness({ tokens: ADMIN_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'list_events', { source: 'github' });

    expect(result.structuredContent).toMatchObject({ count: 1 });
  });

  it('returns the workspace overview', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.overview));
    harness = await connectHarness({ tokens: ADMIN_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'get_overview');

    expect(result.structuredContent).toEqual(fixtures.overview);
  });

  it('requires explicit confirmation before resetting the workspace', async () => {
    const fetchStub = stubFetch(() => envelope({ eventsDeleted: 12 }));
    harness = await connectHarness({
      tokens: ADMIN_ONLY,
      fetchImpl: fetchStub.impl,
      enableReset: true,
    });

    const refused = await callTool(harness.client, 'reset_workspace', { confirm: false });
    expect(refused.isError).toBe(true);
    expect(fetchStub.calls).toHaveLength(0);

    const accepted = await callTool(harness.client, 'reset_workspace', { confirm: true });
    expect(accepted.structuredContent).toEqual({ eventsDeleted: 12 });
  });
});

describe('read tools prefer an admin key but fall back to a consumer key', () => {
  it('uses the consumer token when no admin token exists', async () => {
    const fetchStub = stubFetch(() => envelope([fixtures.subscription]));
    harness = await connectHarness({ tokens: CONSUMER_ONLY, fetchImpl: fetchStub.impl });

    await callTool(harness.client, 'list_subscriptions');

    expect(fetchStub.last().headers.Authorization).toBe('Bearer consumer-token');
  });

  it('uses the admin token when both are available', async () => {
    const fetchStub = stubFetch(() => envelope([fixtures.subscription]));
    harness = await connectHarness({ tokens: ALL_ROLES, fetchImpl: fetchStub.impl });

    await callTool(harness.client, 'list_subscriptions');

    expect(fetchStub.last().headers.Authorization).toBe('Bearer admin-token');
  });
});

describe('error handling', () => {
  it('returns API failures as isError results with a recovery hint', async () => {
    const fetchStub = stubFetch(() =>
      apiError(409, 'LEASE_EXPIRED', 'The delivery lease has expired.'),
    );
    harness = await connectHarness({ tokens: CONSUMER_ONLY, fetchImpl: fetchStub.impl });

    const result = await callTool(harness.client, 'ack_delivery', {
      deliveryId: fixtures.DELIVERY_ID,
      leaseToken: 'stale',
    });

    expect(result.isError).toBe(true);
    const text = resultText(result);
    expect(text).toContain('LEASE_EXPIRED');
    expect(text).toContain('lease_deliveries again');
    expect(text).toContain('req_test');
  });

  it('reports an unreachable API rather than hanging', async () => {
    const failing = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    harness = await connectHarness({ tokens: ADMIN_ONLY, fetchImpl: failing });

    const result = await callTool(harness.client, 'get_overview');

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('DEPENDENCY_UNAVAILABLE');
  });
});

describe('tool metadata', () => {
  it('declares an output schema on every tool so results are structured', async () => {
    harness = await connectHarness({ tokens: ALL_ROLES, enableReset: true });
    const { tools } = await harness.client.listTools();

    const missing = tools.filter((tool) => !tool.outputSchema).map((tool) => tool.name);
    expect(missing).toEqual([]);
  });

  it('marks read-only tools as such', async () => {
    harness = await connectHarness({ tokens: ALL_ROLES });
    const { tools } = await harness.client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(byName.get('list_deliveries')?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('ingest_event')?.annotations?.readOnlyHint).toBe(false);
    expect(byName.get('delete_subscription')?.annotations?.destructiveHint).toBe(true);
  });
});
