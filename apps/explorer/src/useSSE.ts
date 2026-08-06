import { useEffect, useRef } from 'react';
import { useEventStore, type ActivityRecord } from './store/eventStore';
import type { Activity, ActivityType } from './types';

const ACTIVITY_TYPES: ActivityType[] = [
  'event.ingested',
  'delivery.created',
  'delivery.leased',
  'delivery.acknowledged',
  'delivery.retry_scheduled',
  'delivery.dead_lettered',
  'delivery.replayed',
];

/**
 * Subscribe to the Explorer SSE stream and drive the shared event store.
 *
 * - Each frame is deduped by its stream id before being applied (safe under
 *   reconnect + Last-Event-ID replay and out-of-order delivery).
 * - `onFresh` fires only for genuinely new activity (debounced query refetch).
 * - `onReconnect` fires on a false→true connection edge so callers can
 *   reconcile authoritative state from REST rather than trusting the stream.
 *
 * PostgreSQL stays the source of truth; SSE is a live hint layer.
 */
export function useSSE(
  apiBase: string,
  adminToken: string,
  opts: { onFresh?: () => void; onReconnect?: () => void } = {},
) {
  const setConnected = useEventStore((s) => s.setConnected);
  const pushActivity = useEventStore((s) => s.pushActivity);

  // Keep callbacks in refs so the EventSource isn't torn down on every render.
  const onFreshRef = useRef(opts.onFresh);
  const onReconnectRef = useRef(opts.onReconnect);
  onFreshRef.current = opts.onFresh;
  onReconnectRef.current = opts.onReconnect;

  useEffect(() => {
    if (!adminToken) {
      setConnected(false);
      return;
    }

    const url = `${apiBase}/v1/explorer/stream?token=${encodeURIComponent(adminToken)}`;
    const es = new EventSource(url);
    let wasConnected = false;
    let seq = 0;

    es.onopen = () => {
      setConnected(true);
      if (wasConnected === false) {
        // First open or a recovery — reconcile from the authoritative API.
        onReconnectRef.current?.();
      }
      wasConnected = true;
    };
    es.onerror = () => {
      setConnected(false);
      wasConnected = false;
    };

    const handle = (event: MessageEvent) => {
      try {
        const activity = JSON.parse(event.data) as Activity;
        const id = event.lastEventId || `local-${Date.now()}-${seq++}`;
        const record: ActivityRecord = { ...activity, id, receivedAt: Date.now() };
        if (pushActivity(record)) onFreshRef.current?.();
      } catch {
        // ignore malformed frames
      }
    };
    for (const type of ACTIVITY_TYPES) es.addEventListener(type, handle as EventListener);

    return () => {
      es.close();
      setConnected(false);
    };
  }, [apiBase, adminToken, setConnected, pushActivity]);
}
