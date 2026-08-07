// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LeaseRegistry, LEASE_TOKEN_PLACEHOLDER, redactLeaseTokens } from '../src/leaseRegistry.js';

const REAL_TOKEN = '8881a3f0c2d4e6b8a0c2e4f60819a2b4c6d8e0f21436587a9cbedf0123456789';

function leaseResult(items: Array<{ deliveryId: string; leaseToken: string }>) {
  return { count: items.length, items, nextPollAfterMs: 0 };
}

describe('LeaseRegistry', () => {
  it('records tokens from a lease result and returns them', () => {
    const registry = new LeaseRegistry();
    const tokens = registry.remember(leaseResult([{ deliveryId: 'd-1', leaseToken: REAL_TOKEN }]));

    expect(tokens).toEqual([REAL_TOKEN]);
    expect(registry.get('d-1')).toBe(REAL_TOKEN);
  });

  it('substitutes the real token on ack, overriding whatever the model supplied', () => {
    const registry = new LeaseRegistry();
    registry.remember(leaseResult([{ deliveryId: 'd-1', leaseToken: REAL_TOKEN }]));

    // This is the exact failure observed live: the model invents `lt_…`.
    const applied = registry.applyTo('ack_delivery', {
      deliveryId: 'd-1',
      leaseToken: 'lt_0fabricated31',
    });

    expect(applied.leaseToken).toBe(REAL_TOKEN);
    expect(applied.deliveryId).toBe('d-1');
  });

  it('substitutes on nack as well', () => {
    const registry = new LeaseRegistry();
    registry.remember(leaseResult([{ deliveryId: 'd-1', leaseToken: REAL_TOKEN }]));

    const applied = registry.applyTo('nack_delivery', {
      deliveryId: 'd-1',
      leaseToken: 'made-up',
      reason: 'downstream_unavailable',
    });

    expect(applied.leaseToken).toBe(REAL_TOKEN);
    expect(applied.reason).toBe('downstream_unavailable');
  });

  it('leaves non-settling tools untouched', () => {
    const registry = new LeaseRegistry();
    registry.remember(leaseResult([{ deliveryId: 'd-1', leaseToken: REAL_TOKEN }]));

    const applied = registry.applyTo('get_delivery', { deliveryId: 'd-1' });

    expect(applied).toEqual({ deliveryId: 'd-1' });
  });

  it('passes the caller value through when it holds no token for that delivery', () => {
    const registry = new LeaseRegistry();

    // The platform, not this layer, decides whether the value is acceptable.
    const applied = registry.applyTo('ack_delivery', { deliveryId: 'unknown', leaseToken: 'x' });

    expect(applied.leaseToken).toBe('x');
  });

  it('forgets a token once the delivery is settled', () => {
    const registry = new LeaseRegistry();
    registry.remember(leaseResult([{ deliveryId: 'd-1', leaseToken: REAL_TOKEN }]));
    registry.forget('d-1');

    expect(registry.get('d-1')).toBeUndefined();
  });

  it('handles a lease result with several deliveries', () => {
    const registry = new LeaseRegistry();
    registry.remember(
      leaseResult([
        { deliveryId: 'd-1', leaseToken: 'token-one' },
        { deliveryId: 'd-2', leaseToken: 'token-two' },
      ]),
    );

    expect(registry.get('d-1')).toBe('token-one');
    expect(registry.get('d-2')).toBe('token-two');
  });

  it('ignores malformed results without throwing', () => {
    const registry = new LeaseRegistry();

    expect(registry.remember(null)).toEqual([]);
    expect(registry.remember({ items: 'not-an-array' })).toEqual([]);
    expect(registry.remember({ items: [{ deliveryId: 'd-1' }] })).toEqual([]);
    expect(registry.size).toBe(0);
  });

  it('stays bounded under sustained leasing', () => {
    const registry = new LeaseRegistry();
    for (let i = 0; i < 500; i += 1) {
      registry.remember(leaseResult([{ deliveryId: `d-${i}`, leaseToken: `t-${i}` }]));
    }

    expect(registry.size).toBeLessThanOrEqual(200);
    // Most recent survive; oldest are evicted.
    expect(registry.get('d-499')).toBe('t-499');
    expect(registry.get('d-0')).toBeUndefined();
  });
});

describe('redactLeaseTokens', () => {
  it('replaces a real token so it never enters the model context', () => {
    const text = `{"leaseToken": "${REAL_TOKEN}", "deliveryId": "d-1"}`;
    const redacted = redactLeaseTokens(text, [REAL_TOKEN]);

    expect(redacted).not.toContain(REAL_TOKEN);
    expect(redacted).toContain(LEASE_TOKEN_PLACEHOLDER);
    expect(redacted).toContain('d-1');
  });

  it('replaces every occurrence of every token', () => {
    const text = `a ${REAL_TOKEN} b token-two c ${REAL_TOKEN}`;
    const redacted = redactLeaseTokens(text, [REAL_TOKEN, 'token-two']);

    expect(redacted).not.toContain(REAL_TOKEN);
    expect(redacted).not.toContain('token-two');
  });

  it('is a no-op with no tokens', () => {
    expect(redactLeaseTokens('unchanged', [])).toBe('unchanged');
  });
});
