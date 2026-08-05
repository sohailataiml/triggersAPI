import type { DeliveryStatusValue } from '@triggers/contracts';

/**
 * Decide the outcome of a NACK or expired lease given the attempt count.
 * When attempts remain the delivery is rescheduled; otherwise it is dead-lettered.
 */
export interface RetryDecision {
  nextStatus: Extract<DeliveryStatusValue, 'RETRY_SCHEDULED' | 'DEAD_LETTER'>;
  isDeadLetter: boolean;
}

export function decideRetryOutcome(attemptCount: number, maxAttempts: number): RetryDecision {
  if (attemptCount < maxAttempts) {
    return { nextStatus: 'RETRY_SCHEDULED', isDeadLetter: false };
  }
  return { nextStatus: 'DEAD_LETTER', isDeadLetter: true };
}

/** A delivery can be leased only when pending/retry-scheduled and available. */
export function isLeasable(status: DeliveryStatusValue): boolean {
  return status === 'PENDING' || status === 'RETRY_SCHEDULED';
}

/** Replay is only valid from the DEAD_LETTER state. */
export function isReplayable(status: DeliveryStatusValue): boolean {
  return status === 'DEAD_LETTER';
}
