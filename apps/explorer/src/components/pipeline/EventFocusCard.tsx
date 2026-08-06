import { useEffect, useMemo, useState } from 'react';
import { Hash, Inbox, RefreshCw, Target, Timer } from 'lucide-react';
import { useDeliveries, useSubscriptions } from '../../hooks/queries';
import { useRecentEvents } from '../../hooks/useRecentEvents';
import { StatusBadge } from '../shared/StatusBadge';
import { DeliveryAttemptTimeline } from '../events/DeliveryAttemptTimeline';
import { sourceMeta } from '../../lib/samples';
import { countdown, shortId } from '../../lib/format';
import { EmptyState } from '../shared/States';

function Stat({
  icon: Icon,
  label,
  value,
  tint = 'text-text',
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg/50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wide text-muted">
        <Icon size={12} aria-hidden />
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${tint}`}>{value}</div>
    </div>
  );
}

/**
 * Enlarged focus panel for the selected event in Demo Mode. All values are live
 * from REST (delivery snapshot) + SSE; countdowns tick locally from the
 * snapshot's leaseUntil / availableAt. Pull inbox is the only delivery mode, so
 * the "target" is the matched subscription/consumer.
 */
export function EventFocusCard({ eventId }: { eventId: string | null }) {
  const events = useRecentEvents();
  const { data: allDeliveries = [] } = useDeliveries({});
  const { data: subscriptions = [] } = useSubscriptions();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const token = events.find((e) => e.eventId === eventId) ?? null;
  const delivery = useMemo(
    () => allDeliveries.find((d) => d.eventId === eventId) ?? null,
    [allDeliveries, eventId],
  );

  if (!eventId || !token) {
    return (
      <EmptyState
        icon={<Target size={20} aria-hidden />}
        title="Select an event"
        hint="Click a token in the pipeline above to focus its journey."
      />
    );
  }

  const src = sourceMeta(token.source);
  const targetSub = subscriptions.find((s) => s.id === delivery?.subscriptionId);

  const leaseC = delivery?.leaseUntil ? countdown(delivery.leaseUntil, now) : null;
  const retryC =
    delivery?.status === 'RETRY_SCHEDULED' ? countdown(delivery.availableAt, now) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-surface-2 text-2xl"
          aria-hidden
        >
          {src.glyph}
        </span>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-text">{token.eventType}</div>
          <div className="text-sm text-muted">{src.label}</div>
        </div>
        <div className="ml-auto">{delivery ? <StatusBadge status={delivery.status} /> : null}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat icon={Hash} label="Event ID" value={shortId(token.eventId)} />
        <Stat
          icon={Target}
          label="Delivery target"
          value={targetSub ? `Pull inbox → ${targetSub.name}` : 'No match'}
        />
        <Stat icon={Inbox} label="Attempt" value={delivery ? String(delivery.attemptCount) : '—'} />
        <Stat
          icon={Timer}
          label="Lease"
          value={leaseC && delivery?.status === 'LEASED' ? leaseC.label : '—'}
          tint={
            leaseC && delivery?.status === 'LEASED'
              ? leaseC.seconds <= 5
                ? 'text-dead'
                : 'text-leased'
              : 'text-faint'
          }
        />
        <Stat
          icon={RefreshCw}
          label="Next retry"
          value={retryC ? (retryC.expired ? 'now' : retryC.label) : '—'}
          tint={retryC ? 'text-retry' : 'text-faint'}
        />
        <Stat icon={Hash} label="Replays" value={delivery ? String(delivery.replayCount) : '—'} />
      </div>

      {delivery ? (
        <div className="rounded-lg border border-border bg-surface-2/30 p-3">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Attempt timeline
          </div>
          <DeliveryAttemptTimeline deliveryId={delivery.id} eventId={eventId} snapshot={delivery} />
        </div>
      ) : (
        <p className="text-sm text-muted">
          This event matched no subscription, so no delivery was created. Try a preset that matches
          an active subscription (e.g. GitHub pull request).
        </p>
      )}
    </div>
  );
}
