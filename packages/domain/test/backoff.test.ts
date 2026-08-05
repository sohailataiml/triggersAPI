import { describe, expect, it } from 'vitest';
import { BASE_DELAYS_MS, baseDelayMs, computeRetryDelayMs, jitterMs } from '../src/backoff.js';

describe('baseDelayMs', () => {
  it('follows the exponential schedule', () => {
    expect(baseDelayMs(1)).toBe(5_000);
    expect(baseDelayMs(2)).toBe(15_000);
    expect(baseDelayMs(3)).toBe(45_000);
    expect(baseDelayMs(4)).toBe(120_000);
    expect(baseDelayMs(5)).toBe(300_000);
  });

  it('clamps beyond the last attempt to the max delay', () => {
    expect(baseDelayMs(99)).toBe(BASE_DELAYS_MS[BASE_DELAYS_MS.length - 1]);
  });

  it('clamps non-positive attempts to the first delay', () => {
    expect(baseDelayMs(0)).toBe(5_000);
  });
});

describe('jitterMs', () => {
  it('is bounded by min(20% of base, 10s)', () => {
    expect(jitterMs(5_000, () => 0.999999)).toBeLessThanOrEqual(1_000);
    expect(jitterMs(300_000, () => 0.999999)).toBeLessThanOrEqual(10_000);
    expect(jitterMs(5_000, () => 0)).toBe(0);
  });
});

describe('computeRetryDelayMs', () => {
  it('returns base delay when jitter random is zero', () => {
    expect(computeRetryDelayMs(2, () => 0)).toBe(15_000);
  });
});
