// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { maskSensitive, maskText } from '../src/masking.js';

describe('masking', () => {
  it('redacts a lease token while keeping the shape of the result', () => {
    const leased = {
      count: 1,
      items: [
        {
          deliveryId: '0198c1f0-0000-7000-8000-000000000003',
          leaseToken: 'lease_abc123def456ghi789',
          attempt: 1,
        },
      ],
    };

    const masked = maskSensitive(leased) as typeof leased;

    expect(masked.items[0]!.leaseToken).not.toContain('abc123def456');
    expect(masked.items[0]!.leaseToken).toMatch(/••••/);
    // Everything else must survive — the panel still needs to render it.
    expect(masked.items[0]!.deliveryId).toBe('0198c1f0-0000-7000-8000-000000000003');
    expect(masked.count).toBe(1);
  });

  it('does not mutate the original, so the model still receives real values', () => {
    const original = { leaseToken: 'lease_secret_value' };
    maskSensitive(original);
    expect(original.leaseToken).toBe('lease_secret_value');
  });

  it('matches sensitive keys regardless of case or separators', () => {
    const masked = maskSensitive({
      API_KEY: 'sk-live-1234567890',
      'x-auth-token': 'abcdefghijkl',
      Authorization: 'Bearer abcdefghijklmnop',
      signing_secret: 'whsec_abcdefgh',
    }) as Record<string, string>;

    for (const value of Object.values(masked)) {
      expect(value).toMatch(/••••/);
    }
  });

  it('leaves non-sensitive fields untouched', () => {
    const masked = maskSensitive({
      source: 'github',
      eventType: 'pull_request.opened',
      payload: { pullRequestId: 431 },
    });

    expect(masked).toEqual({
      source: 'github',
      eventType: 'pull_request.opened',
      payload: { pullRequestId: 431 },
    });
  });

  it('redacts credential shapes embedded in free text', () => {
    // Synthetic values only — never paste a real token into a test, even a
    // truncated or expired one. These match the shape the matcher looks for.
    const text = maskText(
      'Auth failed for trg_000000000000_EXAMPLEEXAMPLE00 using sk-ant-api03-EXAMPLEKEY',
    );

    expect(text).not.toContain('EXAMPLEEXAMPLE00');
    expect(text).not.toContain('api03-EXAMPLEKEY');
    expect(text).toContain('trg_••••');
    expect(text).toContain('sk-ant-••••');
  });

  it('walks arrays and nested objects', () => {
    const masked = maskSensitive({
      deliveries: [{ meta: { leaseToken: 'lease_deeply_nested_value' } }],
    }) as { deliveries: Array<{ meta: { leaseToken: string } }> };

    expect(masked.deliveries[0]!.meta.leaseToken).toMatch(/••••/);
  });

  it('stops at a depth limit rather than recursing forever', () => {
    // A self-referential object would hang a naive deep clone.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => maskSensitive(cyclic)).not.toThrow();
  });
});
