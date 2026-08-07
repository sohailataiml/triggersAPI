import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { DELIVERY_STATUS } from '../../lib/status';
import { formatCountdown, relativeTime, secondsUntil, shortId } from '../../lib/format';
import { MiniEventJourney } from './MiniEventJourney';
import { StatusBadge } from '../shared/StatusBadge';
import type { DeliveryDetail } from '../../types';

/** Re-render once a second so lease and retry countdowns actually tick. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function CurrentDeliveryCard({
  delivery,
  explorerUrl,
}: {
  delivery: DeliveryDetail;
  explorerUrl: string;
}) {
  const meta = DELIVERY_STATUS[delivery.status];
  const ticking = delivery.status === 'LEASED' || delivery.status === 'RETRY_SCHEDULED';
  const now = useTick(ticking);

  const leaseLeft = secondsUntil(delivery.leaseUntil, now);
  const retryIn = secondsUntil(delivery.availableAt, now);

  return (
    <section className="panel panel-pad space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="field-label">Current delivery</p>
          <p className="mono mt-1 truncate text-sm text-text">{shortId(delivery.id)}</p>
        </div>
        <StatusBadge label={meta.label} tone={meta.tone} pulse={delivery.status === 'LEASED'} />
      </div>

      <p className="text-xs leading-relaxed text-faint">{meta.description}</p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-faint">Attempt</dt>
          <dd className="mt-0.5 font-medium text-text">{delivery.attemptCount}</dd>
        </div>
        <div>
          <dt className="text-faint">Subscription</dt>
          <dd className="mono mt-0.5 truncate text-text">{shortId(delivery.subscriptionId)}</dd>
        </div>
        {delivery.status === 'LEASED' && (
          <div>
            <dt className="text-faint">Lease expires</dt>
            <dd
              className={`mt-0.5 font-medium ${leaseLeft !== null && leaseLeft <= 10 ? 'text-dead' : 'text-leased'}`}
            >
              {formatCountdown(leaseLeft)}
            </dd>
          </div>
        )}
        {delivery.status === 'RETRY_SCHEDULED' && (
          <div>
            <dt className="text-faint">Retry in</dt>
            <dd className="mt-0.5 font-medium text-retry">{formatCountdown(retryIn)}</dd>
          </div>
        )}
        {delivery.acknowledgedAt && (
          <div>
            <dt className="text-faint">Acknowledged</dt>
            <dd className="mt-0.5 text-text">{relativeTime(delivery.acknowledgedAt, now)}</dd>
          </div>
        )}
        {delivery.replayCount > 0 && (
          <div>
            <dt className="text-faint">Replays</dt>
            <dd className="mt-0.5 font-medium text-replay">{delivery.replayCount}</dd>
          </div>
        )}
      </dl>

      {delivery.lastErrorMessage && (
        <p className="rounded-lg border border-dead/25 bg-dead/5 px-2.5 py-1.5 text-xs text-dead">
          <span className="mono">{delivery.lastErrorCode ?? 'error'}</span> ·{' '}
          {delivery.lastErrorMessage}
        </p>
      )}

      <div className="border-t border-border pt-3">
        <p className="field-label mb-2">Event journey</p>
        <MiniEventJourney
          status={delivery.status}
          attemptCount={delivery.attemptCount}
          replayCount={delivery.replayCount}
        />
      </div>

      <a
        className="btn h-8 w-full text-xs"
        // The Explorer's Events page is event-centric, so deep-link by event id
        // — it opens the detail drawer showing this delivery's attempts.
        href={`${explorerUrl}/?section=events&event=${encodeURIComponent(delivery.eventId)}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        <ExternalLink size={13} aria-hidden />
        Open in Explorer
      </a>
    </section>
  );
}
