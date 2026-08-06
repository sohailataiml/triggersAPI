import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../app/apiContext';
import { useDeliveries } from '../../hooks/queries';
import { useEventStore } from '../../store/eventStore';
import { ACTIVITY_META, colorClasses } from '../../lib/status';
import { sourceMeta } from '../../lib/samples';
import { preciseTime, shortId } from '../../lib/format';
import { Drawer } from '../shared/Drawer';
import { CopyButton } from '../shared/CopyButton';
import { JsonViewer } from '../shared/JsonViewer';
import { StatusBadge } from '../shared/StatusBadge';
import { LoadingSkeleton } from '../shared/States';
import { DeliveryAttemptTimeline } from './DeliveryAttemptTimeline';
import type { DeliveryListItem } from '../../types';

type Tab = 'journey' | 'attempts' | 'deliveries';
const TABS: Tab[] = ['journey', 'attempts', 'deliveries'];

/** Event-centric detail: lifecycle journey, per-delivery attempts, and deliveries. */
export function EventDetailDrawer({
  eventId,
  onClose,
}: {
  eventId: string | null;
  onClose: () => void;
}) {
  const api = useApi();
  const activities = useEventStore((s) => s.activities);
  const [tab, setTab] = useState<Tab>('journey');

  // Journey = this event's activity frames, oldest → newest.
  const journey = useMemo(
    () =>
      activities
        .filter((a) => a.eventId === eventId)
        .slice()
        .sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime()),
    [activities, eventId],
  );

  // Deliveries for this event (shares the ['deliveries', {}] cache → SSE refresh).
  const { data: allDeliveries = [] } = useDeliveries({});
  const deliveries = useMemo(
    () => allDeliveries.filter((d) => d.eventId === eventId),
    [allDeliveries, eventId],
  );

  const head = journey[0];
  const source = (head?.summary?.source as string) ?? deliveries[0]?.event.source ?? 'demo';
  const eventType =
    (head?.summary?.eventType as string) ??
    deliveries[0]?.event.eventType ??
    (journey.find((j) => j.summary?.eventType)?.summary?.eventType as string | undefined);

  return (
    <Drawer
      open={Boolean(eventId)}
      onClose={onClose}
      width={520}
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden>{sourceMeta(source).glyph}</span>
          {eventType ?? 'Event'}
        </span>
      }
      subtitle={
        eventId ? (
          <span className="inline-flex items-center gap-1">
            <span className="mono">{shortId(eventId)}</span>
            <CopyButton value={eventId} label="id" />
          </span>
        ) : null
      }
    >
      {eventId && (
        <>
          <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface-2/50 p-1">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                  tab === t ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'journey' && <JourneyTimeline eventId={eventId} journey={journey} />}
          {tab === 'attempts' && <AttemptsTab eventId={eventId} deliveries={deliveries} />}
          {tab === 'deliveries' && <DeliveriesTab deliveries={deliveries} api={api} />}
        </>
      )}
    </Drawer>
  );
}

function JourneyTimeline({
  eventId,
  journey,
}: {
  eventId: string;
  journey: ReturnType<typeof useEventStore.getState>['activities'];
}) {
  if (journey.length === 0) {
    return (
      <p className="text-sm text-muted">
        No live journey captured for <span className="mono">{shortId(eventId)}</span> in this
        session. Open it from the live feed as it happens.
      </p>
    );
  }
  return (
    <ol className="relative ml-2 space-y-4 border-l border-border pl-5">
      {journey.map((a) => {
        const meta = ACTIVITY_META[a.type];
        if (!meta) return null;
        const c = colorClasses(meta.color);
        const Icon = meta.icon;
        const attempt = a.summary?.attempt as number | undefined;
        const reason = a.summary?.reason as string | undefined;
        return (
          <li key={a.id} className="relative">
            <span
              className={`absolute -left-[27px] grid h-5 w-5 place-items-center rounded-full border ${c.border} ${c.bg}`}
            >
              <Icon size={11} className={c.text} aria-hidden />
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-text">{meta.action}</span>
              <time className="mono text-[0.7rem] text-faint">{preciseTime(a.timestamp)}</time>
            </div>
            {(attempt || reason) && (
              <div className="mt-0.5 text-xs text-muted">
                {[attempt ? `attempt ${attempt}` : null, reason?.replace(/_/g, ' ')]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
            {a.deliveryId && (
              <div className="mono mt-0.5 text-[0.7rem] text-faint">
                dlv {shortId(a.deliveryId)}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AttemptsTab({ eventId, deliveries }: { eventId: string; deliveries: DeliveryListItem[] }) {
  if (deliveries.length === 0)
    return <p className="text-sm text-muted">No deliveries recorded for this event.</p>;
  return (
    <div className="space-y-4">
      {deliveries.map((d) => (
        <div key={d.id} className="rounded-lg border border-border bg-surface-2/30 p-3">
          <div className="mb-3 flex items-center gap-2">
            <StatusBadge status={d.status} size="sm" />
            <span className="mono text-faint">dlv {shortId(d.id)}</span>
            <span className="ml-auto text-xs text-muted">{d.attemptCount} attempts</span>
          </div>
          <DeliveryAttemptTimeline deliveryId={d.id} eventId={eventId} snapshot={d} />
        </div>
      ))}
    </div>
  );
}

function DeliveriesTab({
  deliveries,
  api,
}: {
  deliveries: DeliveryListItem[];
  api: ReturnType<typeof useApi>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['delivery-detail', openId],
    queryFn: () => api.delivery(openId as string),
    enabled: Boolean(openId),
    refetchOnWindowFocus: false,
  });

  if (deliveries.length === 0)
    return <p className="text-sm text-muted">No deliveries recorded for this event.</p>;

  return (
    <div className="space-y-2">
      {deliveries.map((d) => (
        <div key={d.id} className="rounded-lg border border-border bg-surface-2/40 p-3">
          <div className="flex items-center gap-2">
            <StatusBadge status={d.status} size="sm" />
            <span className="mono text-faint">{shortId(d.id)}</span>
            <span className="ml-auto text-xs text-muted">{d.attemptCount} attempts</span>
          </div>
          <button
            type="button"
            className="mt-2 text-xs text-accent hover:underline"
            onClick={() => setOpenId(openId === d.id ? null : d.id)}
          >
            {openId === d.id ? 'Hide raw detail' : 'Show raw detail'}
          </button>
          {openId === d.id && (
            <div className="mt-2">
              {detail.isLoading ? (
                <LoadingSkeleton rows={2} />
              ) : detail.data ? (
                <JsonViewer value={detail.data} maxHeight={240} />
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
