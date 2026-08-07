import type { ActivityType, DeliveryStatus } from '../types';

export interface StatusMeta {
  label: string;
  /** Tailwind color token from the shared 7-stage status system. */
  tone: 'ingested' | 'pending' | 'leased' | 'ack' | 'retry' | 'dead' | 'replay';
  description: string;
}

export const DELIVERY_STATUS: Record<DeliveryStatus, StatusMeta> = {
  PENDING: {
    label: 'Pending',
    tone: 'pending',
    description: 'Waiting in the subscription inbox for a consumer to lease it.',
  },
  LEASED: {
    label: 'Leased',
    tone: 'leased',
    description: 'Held by a consumer. Redelivered if not acknowledged before the lease expires.',
  },
  RETRY_SCHEDULED: {
    label: 'Retry scheduled',
    tone: 'retry',
    description: 'Failed and waiting on exponential backoff before becoming available again.',
  },
  ACKNOWLEDGED: {
    label: 'Acknowledged',
    tone: 'ack',
    description: 'Processed successfully. Terminal — it will never be redelivered.',
  },
  DEAD_LETTER: {
    label: 'Dead letter',
    tone: 'dead',
    description: 'Exhausted its retry budget. An admin can replay it back to pending.',
  },
};

export const ACTIVITY_META: Record<ActivityType, { label: string; tone: StatusMeta['tone'] }> = {
  'event.ingested': { label: 'Event ingested', tone: 'ingested' },
  'delivery.created': { label: 'Delivery created', tone: 'pending' },
  'delivery.leased': { label: 'Delivery leased', tone: 'leased' },
  'delivery.acknowledged': { label: 'Acknowledged', tone: 'ack' },
  'delivery.retry_scheduled': { label: 'Retry scheduled', tone: 'retry' },
  'delivery.dead_lettered': { label: 'Dead lettered', tone: 'dead' },
  'delivery.replayed': { label: 'Replayed', tone: 'replay' },
};

/** Tailwind classes per tone — kept explicit so the JIT compiler sees them. */
export const TONE_CLASSES: Record<
  StatusMeta['tone'],
  { text: string; bg: string; border: string; dot: string }
> = {
  ingested: {
    text: 'text-ingested',
    bg: 'bg-ingested/10',
    border: 'border-ingested/30',
    dot: 'bg-ingested',
  },
  pending: {
    text: 'text-pending',
    bg: 'bg-pending/10',
    border: 'border-pending/30',
    dot: 'bg-pending',
  },
  leased: { text: 'text-leased', bg: 'bg-leased/10', border: 'border-leased/30', dot: 'bg-leased' },
  ack: { text: 'text-ack', bg: 'bg-ack/10', border: 'border-ack/30', dot: 'bg-ack' },
  retry: { text: 'text-retry', bg: 'bg-retry/10', border: 'border-retry/30', dot: 'bg-retry' },
  dead: { text: 'text-dead', bg: 'bg-dead/10', border: 'border-dead/30', dot: 'bg-dead' },
  replay: { text: 'text-replay', bg: 'bg-replay/10', border: 'border-replay/30', dot: 'bg-replay' },
};
