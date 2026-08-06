// Local view models mirroring the API contracts (kept standalone so the
// Explorer build doesn't couple to the workspace TS packages).

export type DeliveryStatus =
  'PENDING' | 'LEASED' | 'RETRY_SCHEDULED' | 'ACKNOWLEDGED' | 'DEAD_LETTER';

export interface Overview {
  totalEvents: number;
  pending: number;
  activeLeases: number;
  retryScheduled: number;
  deadLetter: number;
  acknowledged: number;
}

export interface Subscription {
  id: string;
  name: string;
  filters: { source: string | null; eventType: string | null; subject: string | null };
  isActive: boolean;
  visibilityTimeoutSeconds: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryListItem {
  id: string;
  eventId: string;
  subscriptionId: string;
  status: DeliveryStatus;
  attemptCount: number;
  availableAt: string;
  leaseUntil: string | null;
  acknowledgedAt: string | null;
  deadLetteredAt: string | null;
  lastErrorCode: string | null;
  replayCount: number;
  createdAt: string;
  event: { source: string; eventType: string; subject: string | null };
}

export interface DeliveryDetail extends Omit<DeliveryListItem, 'event'> {
  leasedAt: string | null;
  consumerInstanceId: string | null;
  lastErrorMessage: string | null;
  updatedAt: string;
}

/** An event-centric row for the Events page (GET /v1/events). */
export interface EventListItem {
  id: string;
  source: string;
  eventType: string;
  subject: string | null;
  receivedAt: string;
  occurredAt: string | null;
  deliveryCount: number;
  pending: number;
  leased: number;
  retryScheduled: number;
  acknowledged: number;
  deadLetter: number;
}

export type ActivityType =
  | 'event.ingested'
  | 'delivery.created'
  | 'delivery.leased'
  | 'delivery.acknowledged'
  | 'delivery.retry_scheduled'
  | 'delivery.dead_lettered'
  | 'delivery.replayed';

export interface Activity {
  type: ActivityType;
  timestamp: string;
  workspaceId: string;
  eventId?: string;
  deliveryId?: string;
  subscriptionId?: string;
  status?: string;
  summary?: Record<string, unknown>;
}

export interface Settings {
  apiBase: string;
  adminToken: string;
  producerToken: string;
  consumerToken: string;
}

/** A delivery leased by the in-browser consumer console (holds the lease token). */
export interface LeasedItem {
  deliveryId: string;
  eventId: string;
  leaseToken: string;
  leaseUntil: string;
  attempt: number;
  event: {
    source: string;
    eventType: string;
    subject: string | null;
    payload: Record<string, unknown>;
    receivedAt: string;
  };
}
