import { useMemo } from 'react';
import { useEventStore } from '../store/eventStore';
import type { ActivityType } from '../types';

/** Linear pipeline stages. "Stored" is justified by the confirmed ingest frame. */
export const PIPELINE_STAGES = [
  { key: 'source', label: 'Source', color: 'ingested' as const },
  { key: 'ingested', label: 'Ingested', color: 'ingested' as const },
  { key: 'stored', label: 'Stored', color: 'ingested' as const },
  { key: 'matched', label: 'Matched', color: 'pending' as const },
  { key: 'pending', label: 'Pending', color: 'pending' as const },
  { key: 'leased', label: 'Leased', color: 'leased' as const },
  { key: 'acknowledged', label: 'Acknowledged', color: 'ack' as const },
];

export type Branch = 'retry' | 'dead' | 'replay';

export interface EventToken {
  eventId: string;
  source: string;
  eventType: string;
  /** Furthest linear stage index lit (0..6). */
  reachedIndex: number;
  /** Where the token currently sits (0..6). */
  currentIndex: number;
  branch: Branch | null;
  lastAt: string;
  /** First-seen timestamp per stage key (best-effort, from SSE frames). */
  stamps: Partial<Record<string, string>>;
}

// How far into the linear pipeline each activity type advances an event.
const REACH: Record<ActivityType, number> = {
  'event.ingested': 2, // source, ingested, stored
  'delivery.created': 4, // matched, pending
  'delivery.leased': 5,
  'delivery.acknowledged': 6,
  'delivery.retry_scheduled': 4, // returns to pending
  'delivery.dead_lettered': 4,
  'delivery.replayed': 4, // back to pending
};

const STAGE_STAMP: Partial<Record<ActivityType, string>> = {
  'event.ingested': 'ingested',
  'delivery.created': 'matched',
  'delivery.leased': 'leased',
  'delivery.acknowledged': 'acknowledged',
};

/**
 * Derive recent event tokens (newest first) from the SSE activity feed.
 * Groups activity by eventId and folds it into a single pipeline position.
 * This is a live-hint projection; authoritative state comes from REST.
 */
export function useRecentEvents(limit = 14): EventToken[] {
  const activities = useEventStore((s) => s.activities);

  return useMemo(() => {
    const byEvent = new Map<string, EventToken>();
    // Oldest → newest so later frames advance the token.
    for (let i = activities.length - 1; i >= 0; i--) {
      const a = activities[i];
      if (!a.eventId) continue;
      const reach = REACH[a.type] ?? 0;
      const existing = byEvent.get(a.eventId);

      const source = (a.summary?.source as string) ?? existing?.source ?? 'demo';
      const eventType = (a.summary?.eventType as string) ?? existing?.eventType ?? a.type;

      const branch: Branch | null =
        a.type === 'delivery.dead_lettered'
          ? 'dead'
          : a.type === 'delivery.retry_scheduled'
            ? 'retry'
            : a.type === 'delivery.replayed'
              ? 'replay'
              : a.type === 'delivery.acknowledged' || a.type === 'delivery.leased'
                ? null
                : (existing?.branch ?? null);

      const token: EventToken = {
        eventId: a.eventId,
        source,
        eventType,
        reachedIndex: Math.max(existing?.reachedIndex ?? 0, reach),
        currentIndex: reach,
        branch,
        lastAt: a.timestamp,
        stamps: { ...existing?.stamps },
      };
      const stampKey = STAGE_STAMP[a.type];
      if (stampKey && !token.stamps[stampKey]) token.stamps[stampKey] = a.timestamp;
      byEvent.set(a.eventId, token);
    }

    return Array.from(byEvent.values())
      .sort((x, y) => new Date(y.lastAt).getTime() - new Date(x.lastAt).getTime())
      .slice(0, limit);
  }, [activities, limit]);
}
