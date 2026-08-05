/**
 * Exponential retry backoff schedule (milliseconds), indexed by attempt.
 * Attempt 1 -> 5s, 2 -> 15s, 3 -> 45s, 4 -> 2m, 5+ -> 5m.
 */
export const BASE_DELAYS_MS = [5_000, 15_000, 45_000, 120_000, 300_000] as const;

const MAX_JITTER_MS = 10_000;

/** The deterministic base delay for a given attempt count (no jitter). */
export function baseDelayMs(attemptCount: number): number {
  const index = Math.min(Math.max(attemptCount - 1, 0), BASE_DELAYS_MS.length - 1);
  return BASE_DELAYS_MS[index]!;
}

/**
 * Bounded jitter for a base delay: up to min(20% of base, 10s).
 * Accepts an injectable random source for deterministic tests.
 */
export function jitterMs(baseDelay: number, random: () => number = Math.random): number {
  const cap = Math.min(baseDelay * 0.2, MAX_JITTER_MS);
  return Math.floor(random() * cap);
}

/** Total retry delay for an attempt, including bounded jitter. */
export function computeRetryDelayMs(
  attemptCount: number,
  random: () => number = Math.random,
): number {
  const base = baseDelayMs(attemptCount);
  return base + jitterMs(base, random);
}
