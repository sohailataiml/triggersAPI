import { afterEach, describe, expect, it } from 'vitest';
import {
  connectHarness,
  envelope,
  resourceJson,
  stubFetch,
  type Harness,
} from './helpers/harness.js';
import * as fixtures from './helpers/fixtures.js';

let harness: Harness | undefined;

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('resources', () => {
  it('exposes the orientation snapshots to a reading key', async () => {
    harness = await connectHarness({ tokens: { admin: 'admin-token' } });
    const { resources } = await harness.client.listResources();

    expect(resources.map((resource) => resource.uri).sort()).toEqual([
      'triggers://deliveries/dead-letter',
      'triggers://overview',
      'triggers://subscriptions',
    ]);
  });

  it('does not advertise a resources capability for a producer-only key', async () => {
    harness = await connectHarness({ tokens: { producer: 'producer-token' } });

    // A producer key can read nothing, so no resources are registered and the
    // server must not claim the capability.
    expect(harness.client.getServerCapabilities()?.resources).toBeUndefined();
    await expect(harness.client.listResources()).rejects.toThrow(/Method not found/);
  });

  it('advertises both capabilities for a reading key', async () => {
    harness = await connectHarness({ tokens: { admin: 'admin-token' } });
    const capabilities = harness.client.getServerCapabilities();

    expect(capabilities?.tools).toBeDefined();
    expect(capabilities?.resources).toBeDefined();
  });

  it('reads the overview as JSON', async () => {
    const fetchStub = stubFetch(() => envelope(fixtures.overview));
    harness = await connectHarness({ tokens: { admin: 'admin-token' }, fetchImpl: fetchStub.impl });

    const result = await harness.client.readResource({ uri: 'triggers://overview' });
    const first = result.contents[0];

    expect(first?.mimeType).toBe('application/json');
    expect(resourceJson(result)).toEqual(fixtures.overview);
    expect(fetchStub.last().path).toBe('/v1/explorer/overview');
  });

  it('reads the dead-letter queue filtered to DEAD_LETTER', async () => {
    const fetchStub = stubFetch(() => envelope([fixtures.deliveryListItem]));
    harness = await connectHarness({ tokens: { admin: 'admin-token' }, fetchImpl: fetchStub.impl });

    const result = await harness.client.readResource({
      uri: 'triggers://deliveries/dead-letter',
    });

    expect(resourceJson(result)).toHaveLength(1);
    expect(fetchStub.last().path).toContain('status=DEAD_LETTER');
    expect(fetchStub.last().path).toContain('limit=200');
  });

  it('reads the subscription list', async () => {
    const fetchStub = stubFetch(() => envelope([fixtures.subscription]));
    harness = await connectHarness({
      tokens: { consumer: 'consumer-token' },
      fetchImpl: fetchStub.impl,
    });

    const result = await harness.client.readResource({ uri: 'triggers://subscriptions' });

    expect(resourceJson(result)).toEqual([fixtures.subscription]);
    expect(fetchStub.last().headers.Authorization).toBe('Bearer consumer-token');
  });
});
