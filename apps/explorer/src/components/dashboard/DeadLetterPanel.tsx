import { useState } from 'react';
import { Skull, Undo2 } from 'lucide-react';
import { useApi, useSettings } from '../../app/apiContext';
import { useDeliveries, useSubscriptions } from '../../hooks/queries';
import { sourceMeta } from '../../lib/samples';
import { relativeTime, shortId } from '../../lib/format';
import { EmptyState, ErrorState } from '../shared/States';

/** Dead-letter recovery: list dead-lettered deliveries and replay them. */
export function DeadLetterPanel({ onChange }: { onChange: () => void }) {
  const api = useApi();
  const { consumerToken } = useSettings();
  const { data: deadLetters = [], isLoading } = useDeliveries({ status: 'DEAD_LETTER' });
  const { data: subscriptions = [] } = useSubscriptions();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reason, setReason] = useState('Replayed from Explorer');
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoNote, setDemoNote] = useState<string | null>(null);

  async function replay(id: string) {
    setErr(null);
    setReplayingId(id);
    try {
      await api.replay(id, reason || 'Replayed from Explorer');
      setConfirmingId(null);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setReplayingId(null);
    }
  }

  /** Force a dead-letter: maxAttempts=1, ingest, lease, NACK. */
  async function runDemo() {
    const target = subscriptions[0];
    if (!target) return;
    setErr(null);
    setDemoNote(null);
    setDemoBusy(true);
    try {
      await api.updateSubscription(target.id, { maxAttempts: 1 });
      const { eventId } = await api.ingest({
        source: target.filters.source ?? 'demo',
        eventType: target.filters.eventType ?? 'demo.failed',
        subject: target.filters.subject ?? undefined,
        payload: { deadLetterDemo: true },
      });
      const { items } = await api.lease(target.id, 0);
      const leased = items.find((i) => i.eventId === eventId) ?? items[0];
      if (!leased) {
        setDemoNote('Ingested, but nothing was leasable — try again.');
        return;
      }
      await api.nack(leased.deliveryId, leased.leaseToken, 'dead_letter_demo');
      setDemoNote('Forced a dead-letter — it should appear below, ready to replay.');
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Dead-letter demo failed');
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <div className="panel panel-pad">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skull size={15} className="text-dead" aria-hidden />
          <h2 className="text-sm font-semibold text-text">Dead-letter recovery</h2>
        </div>
        <button
          type="button"
          className="btn btn-ghost h-7 px-2 py-0 text-xs"
          onClick={runDemo}
          disabled={demoBusy || !consumerToken || subscriptions.length === 0}
          title="Set maxAttempts=1, ingest, lease, and NACK to force a dead-letter"
        >
          {demoBusy ? 'Running…' : 'Dead-letter demo'}
        </button>
      </div>

      {err && (
        <div className="mb-2">
          <ErrorState message={err} />
        </div>
      )}
      {demoNote && <p className="mb-2 text-xs text-muted">{demoNote}</p>}

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-surface-2/60" aria-hidden />
      ) : deadLetters.length === 0 ? (
        <EmptyState
          icon={<Skull size={20} aria-hidden />}
          title="No dead letters"
          hint="Deliveries that exhaust their retries land here for replay."
        />
      ) : (
        <ul className="space-y-2">
          {deadLetters.map((d) => (
            <li key={d.id} className="rounded-lg border border-dead/25 bg-dead/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <span aria-hidden>{sourceMeta(d.event.source).glyph}</span>
                <span className="text-sm font-medium text-text">{d.event.eventType}</span>
                <span className="mono text-faint">{shortId(d.id)}</span>
                <span className="ml-auto text-xs text-muted">
                  {d.attemptCount} attempts · {relativeTime(d.deadLetteredAt)}
                </span>
              </div>
              {d.lastErrorCode && (
                <div className="mt-1 text-xs text-dead/80">reason: {d.lastErrorCode}</div>
              )}
              <div className="mt-2">
                {confirmingId === d.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="input h-8 max-w-[220px] py-0 text-xs"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Replay reason"
                      aria-label="Replay reason"
                    />
                    <button
                      type="button"
                      className="btn btn-primary h-8 px-2.5 py-0 text-xs"
                      disabled={replayingId === d.id}
                      onClick={() => replay(d.id)}
                    >
                      <Undo2 size={12} aria-hidden />
                      {replayingId === d.id ? 'Replaying…' : 'Confirm replay'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost h-8 px-2 py-0 text-xs"
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger h-8 px-2.5 py-0 text-xs"
                    onClick={() => {
                      setConfirmingId(d.id);
                      setReason('Replayed from Explorer');
                    }}
                  >
                    <Undo2 size={12} aria-hidden />
                    Replay
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
