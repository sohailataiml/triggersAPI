import { useEventStore } from '../../store/eventStore';

/**
 * Live SSE status. Three meaningful states:
 *  - live: stream connected
 *  - reconnecting: was connected, currently dropped (EventSource auto-retries)
 *  - offline: never connected (no token / API down)
 */
export function ConnectionIndicator() {
  const connected = useEventStore((s) => s.connected);
  const everConnected = useEventStore((s) => s.everConnected);

  const state = connected ? 'live' : everConnected ? 'reconnecting' : 'offline';
  const meta = {
    live: { label: 'Stream live', dot: 'bg-ack', ring: 'ring-ack/50', text: 'text-ack' },
    reconnecting: {
      label: 'Reconnecting…',
      dot: 'bg-leased',
      ring: 'ring-leased/50',
      text: 'text-leased',
    },
    offline: {
      label: 'Stream offline',
      dot: 'bg-faint',
      ring: 'ring-transparent',
      text: 'text-muted',
    },
  }[state];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/80 px-2.5 py-1 text-xs font-medium ${meta.text}`}
      role="status"
      aria-live="polite"
    >
      <span className={`relative flex h-2 w-2`}>
        {state === 'live' && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${meta.dot} opacity-60`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot} ring-2 ${meta.ring}`}
        />
      </span>
      {meta.label}
    </span>
  );
}
