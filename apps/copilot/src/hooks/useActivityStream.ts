import { useEffect, useRef } from 'react';
import { useActivityStore, type ActivityRecord } from '../store/activityStore';
import type { Activity, ActivityType } from '../types';

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
 * Subscribe to the Copilot backend's proxied lifecycle stream.
 *
 * The proxy exists so the browser needs no Triggers credential: `EventSource`
 * cannot set headers, and we refuse to put a token in a query string.
 * `onFresh` fires only for genuinely new frames so callers can refetch.
 */
export function useActivityStream(opts: { onFresh?: () => void } = {}): void {
  const setConnected = useActivityStore((s) => s.setConnected);
  const push = useActivityStore((s) => s.push);

  const onFreshRef = useRef(opts.onFresh);
  onFreshRef.current = opts.onFresh;

  useEffect(() => {
    const source = new EventSource('/copilot/activity');
    let seq = 0;

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    const handle = (event: MessageEvent) => {
      try {
        const activity = JSON.parse(event.data) as Activity;
        const record: ActivityRecord = {
          ...activity,
          id: event.lastEventId || `local-${Date.now()}-${(seq += 1)}`,
          receivedAt: Date.now(),
        };
        if (push(record)) onFreshRef.current?.();
      } catch {
        // Ignore malformed frames.
      }
    };

    for (const type of ACTIVITY_TYPES) source.addEventListener(type, handle as EventListener);

    return () => {
      source.close();
      setConnected(false);
    };
  }, [push, setConnected]);
}
