import { useEffect, useState } from 'react';
import { ExternalLink, Inbox } from 'lucide-react';
import { fetchContextSnapshot } from '../../api/copilotClient';
import { useActivityStore } from '../../store/activityStore';
import { shortId } from '../../lib/format';
import { CurrentDeliveryCard } from './CurrentDeliveryCard';
import { RecentActivity } from './RecentActivity';
import type { Capabilities, ContextSnapshot, SessionContext } from '../../types';

const OVERVIEW_ROWS = [
  { key: 'pending', label: 'Pending', tone: 'text-pending' },
  { key: 'activeLeases', label: 'Leased', tone: 'text-leased' },
  { key: 'retryScheduled', label: 'Retrying', tone: 'text-retry' },
  { key: 'deadLetter', label: 'Dead letter', tone: 'text-dead' },
  { key: 'acknowledged', label: 'Acknowledged', tone: 'text-ack' },
] as const;

/**
 * A focused view of what the conversation is currently about — not a second
 * Explorer. It shows the selected delivery's real state, the lifecycle it has
 * travelled, and the live stream; anything deeper is a link to the Explorer.
 *
 * State here is fetched from the server, never derived from the chat
 * transcript, so what the agent *said* can never contradict the database.
 */
export function LiveContextPanel({
  context,
  capabilities,
}: {
  context: SessionContext;
  capabilities: Capabilities | null;
}) {
  const [snapshot, setSnapshot] = useState<ContextSnapshot | null>(null);
  const revision = useActivityStore((state) => state.revision);
  const explorerUrl = capabilities?.explorerUrl ?? 'http://localhost:5173';

  // Refetch when the selection changes or the platform emits new activity.
  useEffect(() => {
    let cancelled = false;
    fetchContextSnapshot(context)
      .then((next) => {
        if (!cancelled) setSnapshot(next);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [context.selectedDeliveryId, context.selectedSubscriptionId, revision]);

  const overview = snapshot?.overview;

  return (
    <div className="space-y-3">
      <section className="panel panel-pad">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="field-label">Workspace</p>
          <a
            className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-accent"
            href={explorerUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Explorer
            <ExternalLink size={11} aria-hidden />
          </a>
        </div>

        {overview ? (
          <>
            <p className="text-2xl font-semibold tracking-tight text-text">
              {overview.totalEvents}
              <span className="ml-1.5 text-xs font-normal text-faint">events</span>
            </p>
            <dl className="mt-2.5 space-y-1">
              {OVERVIEW_ROWS.map((row) => (
                <div key={row.key} className="flex items-center justify-between text-xs">
                  <dt className="text-faint">{row.label}</dt>
                  <dd className={`font-medium ${overview[row.key] > 0 ? row.tone : 'text-faint'}`}>
                    {overview[row.key]}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="py-2 text-xs text-faint">Overview unavailable.</p>
        )}
      </section>

      {snapshot?.subscription && (
        <section className="panel panel-pad">
          <p className="field-label">Subscription</p>
          <p className="mt-1 truncate text-sm font-medium text-text">
            {snapshot.subscription.name}
          </p>
          <p className="mono mt-0.5 text-xs text-faint">{shortId(snapshot.subscription.id)}</p>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-faint">Filters</dt>
              <dd className="mono truncate text-right text-muted">
                {[snapshot.subscription.filters.source, snapshot.subscription.filters.eventType]
                  .filter(Boolean)
                  .join(' · ') || 'match all'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faint">Visibility timeout</dt>
              <dd className="text-muted">{snapshot.subscription.visibilityTimeoutSeconds}s</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-faint">Max attempts</dt>
              <dd className="text-muted">{snapshot.subscription.maxAttempts}</dd>
            </div>
          </dl>
        </section>
      )}

      {snapshot?.delivery ? (
        <CurrentDeliveryCard delivery={snapshot.delivery} explorerUrl={explorerUrl} />
      ) : (
        <section className="panel panel-pad text-center">
          <span className="mx-auto grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-2 text-faint">
            <Inbox size={16} aria-hidden />
          </span>
          <p className="mt-2 text-sm text-muted">No delivery selected</p>
          <p className="mt-0.5 text-xs text-faint">
            Publish or lease an event and its journey appears here.
          </p>
        </section>
      )}

      <RecentActivity />
    </div>
  );
}
