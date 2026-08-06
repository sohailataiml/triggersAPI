import {
  ArrowDownToLine,
  CheckCircle2,
  CircleDot,
  Clock,
  Inbox,
  RefreshCw,
  Skull,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityType, DeliveryStatus } from '../types';

/** One canonical stage token used across badges, pipeline, and streams. */
export interface StageMeta {
  key: string;
  label: string;
  /** Tailwind color token (see tailwind.config.ts). */
  color: 'ingested' | 'pending' | 'leased' | 'ack' | 'retry' | 'dead' | 'replay';
  icon: LucideIcon;
}

/** Delivery status → visual metadata. Color is never the only signal. */
export const DELIVERY_STATUS_META: Record<DeliveryStatus, StageMeta> = {
  PENDING: { key: 'PENDING', label: 'Pending', color: 'pending', icon: Clock },
  LEASED: { key: 'LEASED', label: 'Leased', color: 'leased', icon: Inbox },
  RETRY_SCHEDULED: { key: 'RETRY_SCHEDULED', label: 'Retry', color: 'retry', icon: RefreshCw },
  ACKNOWLEDGED: { key: 'ACKNOWLEDGED', label: 'Acknowledged', color: 'ack', icon: CheckCircle2 },
  DEAD_LETTER: { key: 'DEAD_LETTER', label: 'Dead letter', color: 'dead', icon: Skull },
};

/** SSE activity type → visual metadata + a human sentence. */
export const ACTIVITY_META: Record<
  ActivityType,
  StageMeta & { action: string; kind: 'event' | 'delivery' }
> = {
  'event.ingested': {
    key: 'event.ingested',
    label: 'Ingested',
    color: 'ingested',
    icon: ArrowDownToLine,
    action: 'Event received',
    kind: 'event',
  },
  'delivery.created': {
    key: 'delivery.created',
    label: 'Matched',
    color: 'pending',
    icon: CircleDot,
    action: 'Delivery created',
    kind: 'delivery',
  },
  'delivery.leased': {
    key: 'delivery.leased',
    label: 'Leased',
    color: 'leased',
    icon: Inbox,
    action: 'Delivery leased',
    kind: 'delivery',
  },
  'delivery.acknowledged': {
    key: 'delivery.acknowledged',
    label: 'Acknowledged',
    color: 'ack',
    icon: CheckCircle2,
    action: 'Delivery acknowledged',
    kind: 'delivery',
  },
  'delivery.retry_scheduled': {
    key: 'delivery.retry_scheduled',
    label: 'Retry',
    color: 'retry',
    icon: RefreshCw,
    action: 'Retry scheduled',
    kind: 'delivery',
  },
  'delivery.dead_lettered': {
    key: 'delivery.dead_lettered',
    label: 'Dead letter',
    color: 'dead',
    icon: Skull,
    action: 'Moved to dead letter',
    kind: 'delivery',
  },
  'delivery.replayed': {
    key: 'delivery.replayed',
    label: 'Replayed',
    color: 'replay',
    icon: Undo2,
    action: 'Delivery replayed',
    kind: 'delivery',
  },
};

/** Tailwind utility fragments for a status color (bg tint, text, border, ring). */
export function colorClasses(color: StageMeta['color']): {
  text: string;
  bg: string;
  border: string;
  dot: string;
  ring: string;
} {
  // Static map so Tailwind's JIT sees every class literal.
  const map = {
    ingested: {
      text: 'text-ingested',
      bg: 'bg-ingested/10',
      border: 'border-ingested/30',
      dot: 'bg-ingested',
      ring: 'ring-ingested/50',
    },
    pending: {
      text: 'text-pending',
      bg: 'bg-pending/10',
      border: 'border-pending/30',
      dot: 'bg-pending',
      ring: 'ring-pending/50',
    },
    leased: {
      text: 'text-leased',
      bg: 'bg-leased/10',
      border: 'border-leased/30',
      dot: 'bg-leased',
      ring: 'ring-leased/50',
    },
    ack: {
      text: 'text-ack',
      bg: 'bg-ack/10',
      border: 'border-ack/30',
      dot: 'bg-ack',
      ring: 'ring-ack/50',
    },
    retry: {
      text: 'text-retry',
      bg: 'bg-retry/10',
      border: 'border-retry/30',
      dot: 'bg-retry',
      ring: 'ring-retry/50',
    },
    dead: {
      text: 'text-dead',
      bg: 'bg-dead/10',
      border: 'border-dead/30',
      dot: 'bg-dead',
      ring: 'ring-dead/50',
    },
    replay: {
      text: 'text-replay',
      bg: 'bg-replay/10',
      border: 'border-replay/30',
      dot: 'bg-replay',
      ring: 'ring-replay/50',
    },
  } as const;
  return map[color];
}
