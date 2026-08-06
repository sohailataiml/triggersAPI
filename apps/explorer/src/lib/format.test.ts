import { describe, expect, it } from 'vitest';
import { countdown, durationBetween, relativeTime, shortId } from './format';

describe('format helpers', () => {
  it('shortId takes the first UUID segment', () => {
    expect(shortId('019fd7ba-1234-7890-abcd-ef0123456789')).toBe('019fd7ba');
    expect(shortId(null)).toBe('');
  });

  it('relativeTime buckets recent times', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 1000).toISOString(), now)).toBe('just now');
    expect(relativeTime(new Date(now - 12_000).toISOString(), now)).toBe('12s ago');
    expect(relativeTime(new Date(now - 3 * 60_000).toISOString(), now)).toBe('3m ago');
  });

  it('countdown reports remaining and expired states', () => {
    const now = Date.now();
    const live = countdown(new Date(now + 58_000).toISOString(), now);
    expect(live.expired).toBe(false);
    expect(live.label).toBe('58s left');

    const gone = countdown(new Date(now - 4000).toISOString(), now);
    expect(gone.expired).toBe(true);
    expect(gone.label).toContain('expired');
  });

  it('durationBetween formats sub-second and second ranges', () => {
    const a = '2026-08-06T10:39:32.100Z';
    expect(durationBetween(a, '2026-08-06T10:39:32.500Z')).toBe('400ms');
    expect(durationBetween(a, '2026-08-06T10:39:33.900Z')).toBe('1.8s');
    expect(durationBetween(null, a)).toBeNull();
  });
});
