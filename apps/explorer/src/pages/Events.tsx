import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useEvents, type EventFilters } from '../hooks/queries';
import { sourceMeta } from '../lib/samples';
import { clockTime, relativeTime, shortId } from '../lib/format';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/shared/States';
import { EventDetailDrawer } from '../components/events/EventDetailDrawer';
import type { EventListItem } from '../types';

const STATUS_OPTIONS = ['', 'PENDING', 'LEASED', 'RETRY_SCHEDULED', 'ACKNOWLEDGED', 'DEAD_LETTER'];

/** Rollup chips — count per delivery status, only shown when non-zero. */
function Rollup({ e }: { e: EventListItem }) {
  const chips: Array<[string, number, string]> = [
    ['pending', e.pending, 'text-pending'],
    ['leased', e.leased, 'text-leased'],
    ['retry', e.retryScheduled, 'text-retry'],
    ['ack', e.acknowledged, 'text-ack'],
    ['dead', e.deadLetter, 'text-dead'],
  ];
  const active = chips.filter(([, n]) => n > 0);
  if (active.length === 0) return <span className="text-xs text-faint">no deliveries</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {active.map(([label, n, cls]) => (
        <span key={label} className={`text-xs tabular-nums ${cls}`}>
          {n} {label}
        </span>
      ))}
    </span>
  );
}

export function Events() {
  const [filters, setFilters] = useState<EventFilters>({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useEvents(filters);

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-4">
      <div className="panel panel-pad">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <input
              className="input pl-8"
              placeholder="Search source, type, or subject…"
              value={filters.search ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined }))}
            />
          </div>
          <input
            className="input max-w-[160px]"
            placeholder="source"
            value={filters.source ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value || undefined }))}
          />
          <select
            className="input max-w-[180px]"
            value={filters.status ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
            aria-label="Status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s || 'any status'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <LoadingSkeleton rows={6} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState
              message={error instanceof Error ? error.message : 'Failed to load events'}
              onRetry={() => void refetch()}
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No events" hint="Send events from the Dashboard composer." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">Deliveries</th>
                <th className="px-4 py-2.5 font-medium">Received</th>
                <th className="px-4 py-2.5 font-medium text-right">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelectedEventId(e.id)}
                  className="cursor-pointer transition hover:bg-surface-2/40"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span aria-hidden>{sourceMeta(e.source).glyph}</span>
                      <div>
                        <div className="font-medium text-text">{e.eventType}</div>
                        <div className="text-xs text-faint">
                          {sourceMeta(e.source).label}
                          {e.subject ? ` · ${e.subject}` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Rollup e={e} />
                  </td>
                  <td className="px-4 py-2.5 text-muted" title={clockTime(e.receivedAt)}>
                    {relativeTime(e.receivedAt)}
                  </td>
                  <td className="mono px-4 py-2.5 text-right text-faint">{shortId(e.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EventDetailDrawer eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />
    </div>
  );
}
