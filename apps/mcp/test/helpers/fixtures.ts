/**
 * Response fixtures shaped exactly like the API's contracts. Tool output is
 * validated against the same Zod schemas the API serializes with, so a drift
 * between these and `@triggers/contracts` surfaces as a test failure.
 */

export const SUBSCRIPTION_ID = '0198c1f0-0000-7000-8000-000000000001';
export const EVENT_ID = '0198c1f0-0000-7000-8000-000000000002';
export const DELIVERY_ID = '0198c1f0-0000-7000-8000-000000000003';

const NOW = '2026-08-07T12:00:00.000Z';

export const subscription = {
  id: SUBSCRIPTION_ID,
  name: 'GitHub pull requests',
  filters: { source: 'github', eventType: 'pull_request.opened', subject: null },
  isActive: true,
  visibilityTimeoutSeconds: 60,
  maxAttempts: 5,
  createdAt: NOW,
  updatedAt: NOW,
};

export const ingestResponse = {
  eventId: EVENT_ID,
  receivedAt: NOW,
  matchedSubscriptions: 1,
  status: 'accepted' as const,
  duplicate: false,
};

export const inboxItem = {
  deliveryId: DELIVERY_ID,
  eventId: EVENT_ID,
  leaseToken: 'lease_abc123',
  leaseUntil: '2026-08-07T12:01:00.000Z',
  attempt: 1,
  event: {
    source: 'github',
    eventType: 'pull_request.opened',
    subject: 'repo:acme/widgets',
    payload: { pullRequestId: 431 },
    metadata: { traceId: 'trace_123' },
    receivedAt: NOW,
  },
};

export const inboxResponse = { items: [inboxItem], nextPollAfterMs: 0 };

export const ackResponse = {
  deliveryId: DELIVERY_ID,
  status: 'acknowledged' as const,
  acknowledgedAt: NOW,
  duplicateAck: false,
};

export const nackResponse = {
  deliveryId: DELIVERY_ID,
  status: 'RETRY_SCHEDULED' as const,
  attempt: 2,
  availableAt: '2026-08-07T12:00:05.000Z',
};

export const replayResponse = {
  deliveryId: DELIVERY_ID,
  status: 'PENDING' as const,
  replayCount: 1,
  replayedAt: NOW,
};

export const deliveryDetail = {
  id: DELIVERY_ID,
  eventId: EVENT_ID,
  subscriptionId: SUBSCRIPTION_ID,
  status: 'DEAD_LETTER' as const,
  attemptCount: 5,
  availableAt: NOW,
  leasedAt: null,
  leaseUntil: null,
  consumerInstanceId: null,
  acknowledgedAt: null,
  deadLetteredAt: NOW,
  lastErrorCode: 'downstream_unavailable',
  lastErrorMessage: 'CRM 503',
  replayCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

export const deliveryListItem = {
  id: DELIVERY_ID,
  eventId: EVENT_ID,
  subscriptionId: SUBSCRIPTION_ID,
  status: 'DEAD_LETTER' as const,
  attemptCount: 5,
  availableAt: NOW,
  leaseUntil: null,
  acknowledgedAt: null,
  deadLetteredAt: NOW,
  lastErrorCode: 'downstream_unavailable',
  replayCount: 0,
  createdAt: NOW,
  event: { source: 'github', eventType: 'pull_request.opened', subject: 'repo:acme/widgets' },
};

export const eventListItem = {
  id: EVENT_ID,
  source: 'github',
  eventType: 'pull_request.opened',
  subject: 'repo:acme/widgets',
  receivedAt: NOW,
  occurredAt: null,
  deliveryCount: 1,
  pending: 0,
  leased: 0,
  retryScheduled: 0,
  acknowledged: 1,
  deadLetter: 0,
};

export const overview = {
  totalEvents: 12,
  pending: 3,
  activeLeases: 1,
  retryScheduled: 2,
  deadLetter: 1,
  acknowledged: 5,
};
