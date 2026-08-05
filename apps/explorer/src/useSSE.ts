import { useEffect, useRef, useState } from 'react';
import type { Activity } from './types';

const ACTIVITY_TYPES = [
  'event.ingested',
  'delivery.created',
  'delivery.leased',
  'delivery.acknowledged',
  'delivery.retry_scheduled',
  'delivery.dead_lettered',
  'delivery.replayed',
];

const MAX_ACTIVITIES = 200;

/**
 * Subscribe to the Explorer SSE stream. Returns the most recent activities
 * (newest first) and a connection flag. Reconnects automatically via
 * EventSource; a `bump` counter lets callers refresh derived data on activity.
 */
export function useSSE(apiBase: string, adminToken: string) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [connected, setConnected] = useState(false);
  const [bump, setBump] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!adminToken) return;
    const url = `${apiBase}/v1/explorer/stream?token=${encodeURIComponent(adminToken)}`;
    const es = new EventSource(url);
    sourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const handle = (event: MessageEvent) => {
      try {
        const activity = JSON.parse(event.data) as Activity;
        setActivities((prev) => [activity, ...prev].slice(0, MAX_ACTIVITIES));
        setBump((n) => n + 1);
      } catch {
        // ignore malformed frames
      }
    };
    for (const type of ACTIVITY_TYPES) es.addEventListener(type, handle as EventListener);

    return () => {
      es.close();
      setConnected(false);
    };
  }, [apiBase, adminToken]);

  return { activities, connected, bump };
}
