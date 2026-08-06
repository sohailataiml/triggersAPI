import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { useEventStore } from '../../store/eventStore';
import { ACTIVITY_META, colorClasses } from '../../lib/status';
import { sourceMeta } from '../../lib/samples';
import { clockTime, relativeTime, shortId } from '../../lib/format';
import type { ActivityRecord } from '../../store/eventStore';

type FilterKey = 'all' | 'events' | 'deliveries' | 'problems';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'events', label: 'Events' },
  { key: 'deliveries', label: 'Deliveries' },
  { key: 'problems', label: 'Problems' },
];

function matchesFilter(a: ActivityRecord, f: FilterKey): boolean {
  const meta = ACTIVITY_META[a.type];
  if (!meta) return false;
  switch (f) {
    case 'events':
      return meta.kind === 'event';
    case 'deliveries':
      return meta.kind === 'delivery';
    case 'problems':
      return a.type === 'delivery.retry_scheduled' || a.type === 'delivery.dead_lettered';
    default:
      return true;
  }
}

/** Humanized, filterable live feed. Dedup happens upstream in the store. */
export function ActivityStream({ onSelect }: { onSelect: (eventId: string) => void }) {
  const activities = useEventStore((s) => s.activities);
  const clear = useEventStore((s) => s.clear);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [paused, setPaused] = useState(false);
  const frozenRef = useRef<ActivityRecord[]>(activities);
  if (!paused) frozenRef.current = activities;

  const visible = useMemo(
    () => frozenRef.current.filter((a) => matchesFilter(a, filter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frozenRef.current, filter],
  );

  // Tick for relative timestamps.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="panel flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">Live activity</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="btn btn-ghost h-7 px-2 py-0 text-xs"
            aria-pressed={paused}
          >
            {paused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={clear}
            className="btn btn-ghost h-7 px-2 py-0 text-xs"
            title="Clear the local feed (does not affect stored data)"
          >
            <Trash2 size={12} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              filter === f.key ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-faint">
            {paused ? 'Paused' : 'Waiting for activity…'}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((a) => (
              <ActivityRow key={a.id} activity={a} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActivityRow({
  activity,
  onSelect,
}: {
  activity: ActivityRecord;
  onSelect: (eventId: string) => void;
}) {
  const meta = ACTIVITY_META[activity.type];
  if (!meta) return null;
  const c = colorClasses(meta.color);
  const Icon = meta.icon;
  const src = activity.summary?.source as string | undefined;
  const type = activity.summary?.eventType as string | undefined;
  const attempt = activity.summary?.attempt as number | undefined;
  const reason = activity.summary?.reason as string | undefined;

  const detail =
    meta.kind === 'event' && src
      ? `${sourceMeta(src).label} · ${type ?? ''}`
      : [attempt ? `attempt ${attempt}` : null, reason ? reason.replace(/_/g, ' ') : null]
          .filter(Boolean)
          .join(' · ');

  const clickable = Boolean(activity.eventId);

  return (
    <li>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => activity.eventId && onSelect(activity.eventId)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2/50 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${c.border} ${c.bg}`}
        >
          <Icon size={13} className={c.text} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-text">{meta.action}</span>
            <time
              className="shrink-0 text-[0.7rem] text-faint"
              title={clockTime(activity.timestamp)}
            >
              {relativeTime(activity.timestamp)}
            </time>
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            {detail && <span className="truncate">{detail}</span>}
            <span className="mono shrink-0 text-faint">
              {activity.deliveryId
                ? `dlv ${shortId(activity.deliveryId)}`
                : `evt ${shortId(activity.eventId)}`}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
