import { describe, expect, it } from 'vitest';
import { MissingRoleTokenError, TriggersApiError, TriggersClient } from '../src/client.js';
import { apiError, BASE_URL, envelope, stubFetch } from './helpers/harness.js';

function buildClient(fetchImpl: typeof fetch, baseUrl = BASE_URL): TriggersClient {
  return new TriggersClient({
    baseUrl,
    tokens: { admin: 'admin-token', consumer: 'consumer-token' },
    timeoutMs: 40_000,
    fetchImpl,
  });
}

describe('TriggersClient', () => {
  it('unwraps the { data } success envelope', async () => {
    const fetchStub = stubFetch(() => envelope({ totalEvents: 7 }));
    const client = buildClient(fetchStub.impl);

    const result = await client.request<{ totalEvents: number }>(
      'admin',
      'GET',
      '/v1/explorer/overview',
    );

    expect(result).toEqual({ totalEvents: 7 });
  });

  it('sends the role-appropriate bearer token', async () => {
    const fetchStub = stubFetch(() => envelope([]));
    const client = buildClient(fetchStub.impl);

    await client.request('consumer', 'GET', '/v1/subscriptions');

    expect(fetchStub.last().headers.Authorization).toBe('Bearer consumer-token');
  });

  it('omits Content-Type on body-less requests', async () => {
    const fetchStub = stubFetch(() => envelope({ deleted: true }));
    const client = buildClient(fetchStub.impl);

    await client.request('admin', 'DELETE', '/v1/subscriptions/abc');

    expect(fetchStub.last().headers['Content-Type']).toBeUndefined();
  });

  it('sets Content-Type when a body is sent', async () => {
    const fetchStub = stubFetch(() => envelope({}));
    const client = buildClient(fetchStub.impl);

    await client.request('admin', 'POST', '/v1/subscriptions', { body: { name: 'x' } });

    expect(fetchStub.last().headers['Content-Type']).toBe('application/json');
    expect(fetchStub.last().body).toEqual({ name: 'x' });
  });

  it('serializes query parameters and drops undefined ones', async () => {
    const fetchStub = stubFetch(() => envelope([]));
    const client = buildClient(fetchStub.impl);

    await client.request('admin', 'GET', '/v1/deliveries', {
      query: { status: 'DEAD_LETTER', limit: 50, subscriptionId: undefined, source: null },
    });

    expect(fetchStub.last().path).toBe('/v1/deliveries?status=DEAD_LETTER&limit=50');
  });

  it('normalizes a base URL with a trailing slash', async () => {
    const fetchStub = stubFetch(() => envelope({}));
    const client = buildClient(fetchStub.impl, `${BASE_URL}/`);

    await client.request('admin', 'GET', '/v1/explorer/overview');

    expect(fetchStub.last().url).toBe(`${BASE_URL}/v1/explorer/overview`);
  });

  it('converts the error envelope into a typed TriggersApiError', async () => {
    const fetchStub = stubFetch(() => apiError(409, 'LEASE_EXPIRED', 'The lease has expired.'));
    const client = buildClient(fetchStub.impl);

    const error = await client
      .request('consumer', 'POST', '/v1/deliveries/abc/ack', { body: {} })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(TriggersApiError);
    const typed = error as TriggersApiError;
    expect(typed.code).toBe('LEASE_EXPIRED');
    expect(typed.status).toBe(409);
    expect(typed.requestId).toBe('req_test');
  });

  it('surfaces a non-envelope error body without crashing', async () => {
    const fetchStub = stubFetch(() => ({ status: 502, body: 'upstream exploded' }));
    const client = buildClient(fetchStub.impl);

    const error = (await client
      .request('admin', 'GET', '/v1/explorer/overview')
      .catch((cause: unknown) => cause)) as TriggersApiError;

    expect(error).toBeInstanceOf(TriggersApiError);
    expect(error.status).toBe(502);
  });

  it('reports an unreachable API as DEPENDENCY_UNAVAILABLE', async () => {
    const failing = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const client = buildClient(failing);

    const error = (await client
      .request('admin', 'GET', '/v1/explorer/overview')
      .catch((cause: unknown) => cause)) as TriggersApiError;

    expect(error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(error.message).toContain(BASE_URL);
  });

  it('throws MissingRoleTokenError for an unconfigured role', async () => {
    const fetchStub = stubFetch(() => envelope({}));
    const client = buildClient(fetchStub.impl);

    await expect(client.request('producer', 'POST', '/v1/events', { body: {} })).rejects.toThrow(
      MissingRoleTokenError,
    );
    expect(fetchStub.calls).toHaveLength(0);
  });

  it('picks the first configured role from the preference list', () => {
    const client = new TriggersClient({
      baseUrl: BASE_URL,
      tokens: { consumer: 'consumer-token' },
      timeoutMs: 40_000,
    });

    expect(client.pickRole(['admin', 'consumer'])).toBe('consumer');
    expect(client.roles).toEqual(['consumer']);
  });
});
