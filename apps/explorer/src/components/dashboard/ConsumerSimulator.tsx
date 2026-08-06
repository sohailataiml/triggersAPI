import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CheckCircle2, Inbox, PlugZap, Radio, Zap } from 'lucide-react';
import { useApi, useSettings } from '../../app/apiContext';
import { useSubscriptions } from '../../hooks/queries';
import { countdown, shortId } from '../../lib/format';
import { sourceMeta } from '../../lib/samples';
import type { LeasedItem } from '../../types';

type State = 'idle' | 'waiting' | 'leased' | 'acked' | 'nacked' | 'crashed';

const STATE_META: Record<State, { label: string; tint: string; icon: typeof Inbox }> = {
  idle: { label: 'Idle', tint: 'text-muted', icon: Radio },
  waiting: { label: 'Waiting for an event', tint: 'text-pending', icon: Radio },
  leased: { label: 'Event received', tint: 'text-leased', icon: Inbox },
  acked: { label: 'Acknowledged', tint: 'text-ack', icon: CheckCircle2 },
  nacked: { label: 'NACKed — retry scheduled', tint: 'text-retry', icon: Ban },
  crashed: { label: 'Crashed — lease will expire', tint: 'text-dead', icon: PlugZap },
};

/**
 * In-browser reference consumer, modeled as an explicit state machine over the
 * real inbox lease / ACK / NACK endpoints. "Simulate crash" drops the lease
 * without acknowledging so the visibility timeout redelivers it.
 */
export function ConsumerSimulator({ onChange }: { onChange: () => void }) {
  const api = useApi();
  const { consumerToken } = useSettings();
  const { data: subscriptions = [] } = useSubscriptions();

  const [subId, setSubId] = useState('');
  const [longPoll, setLongPoll] = useState(true);
  const [state, setState] = useState<State>('idle');
  const [current, setCurrent] = useState<LeasedItem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sub = subId || subscriptions[0]?.id || '';
  const selectedSub = subscriptions.find((s) => s.id === sub);
  const hasConsumer = Boolean(consumerToken);

  // Lease countdown tick.
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state !== 'leased') return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(tickRef.current);
  }, [state]);

  const lease = useMemo(
    () => (current ? countdown(current.leaseUntil, now) : null),
    [current, now],
  );
  // Auto-mark expiry once the lease countdown passes zero.
  useEffect(() => {
    if (state === 'leased' && lease?.expired) {
      setState('idle');
      setCurrent(null);
      setNote('Lease expired — the delivery is available for redelivery.');
      onChange();
    }
  }, [state, lease?.expired, onChange]);

  async function doLease() {
    if (!sub) return;
    setErr(null);
    setNote(null);
    setBusy(true);
    setState(longPoll ? 'waiting' : 'idle');
    try {
      const res = await api.lease(sub, longPoll ? 30 : 0);
      const item = res.items[0] ?? null;
      if (!item) {
        setState('idle');
        setNote('No deliveries available right now.');
      } else {
        setCurrent(item);
        setNow(Date.now());
        setState('leased');
      }
      onChange();
    } catch (e) {
      setState('idle');
      setErr(e instanceof Error ? e.message : 'Lease failed');
    } finally {
      setBusy(false);
    }
  }

  async function doAck() {
    if (!current) return;
    setErr(null);
    setBusy(true);
    try {
      const res = (await api.ack(
        current.deliveryId,
        current.leaseToken,
        `explorer-${current.deliveryId}`,
      )) as { duplicateAck?: boolean };
      setState('acked');
      setNote(res.duplicateAck ? 'ACK was idempotent (duplicate).' : 'Acknowledged successfully.');
      setCurrent(null);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ACK failed');
    } finally {
      setBusy(false);
    }
  }

  async function doNack() {
    if (!current) return;
    setErr(null);
    setBusy(true);
    try {
      await api.nack(current.deliveryId, current.leaseToken, 'processing_failed');
      setState('nacked');
      setNote('NACKed — retry scheduled (or dead-lettered if attempts exhausted).');
      setCurrent(null);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'NACK failed');
    } finally {
      setBusy(false);
    }
  }

  function simulateCrash() {
    // Drop the lease locally without acknowledging — the visibility timeout
    // will redeliver it. This is exactly how a real consumer crash behaves.
    setState('crashed');
    setNote(
      `Consumer "crashed" holding delivery ${shortId(current?.deliveryId)}. Wait for the lease to expire, then lease again to see redelivery.`,
    );
    setCurrent(null);
    onChange();
  }

  const StateIcon = STATE_META[state].icon;

  return (
    <div className="panel panel-pad">
      <div className="mb-3 flex items-center gap-2">
        <Inbox size={15} className="text-accent" aria-hidden />
        <h2 className="text-sm font-semibold text-text">Consumer simulator</h2>
      </div>

      {!hasConsumer && (
        <p className="mb-3 rounded-lg border border-leased/30 bg-leased/10 px-3 py-2 text-xs text-leased">
          Add a CONSUMER token in Settings to lease and acknowledge deliveries.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input max-w-[220px]"
          value={sub}
          onChange={(e) => setSubId(e.target.value)}
          aria-label="Subscription"
        >
          {subscriptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={longPoll}
            onChange={(e) => setLongPoll(e.target.checked)}
          />
          long-poll 30s
        </label>
      </div>

      {/* state banner */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-bg/50 px-3 py-2">
        <StateIcon size={16} className={STATE_META[state].tint} aria-hidden />
        <span className={`text-sm font-medium ${STATE_META[state].tint}`}>
          {STATE_META[state].label}
        </span>
        {state === 'leased' && lease && (
          <span
            className={`ml-auto rounded-md border px-2 py-0.5 text-xs tabular-nums ${
              lease.seconds <= 5
                ? 'border-dead/40 bg-dead/10 text-dead'
                : 'border-leased/40 bg-leased/10 text-leased'
            }`}
          >
            lease {lease.label}
          </span>
        )}
      </div>

      {current && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm">
          <span aria-hidden>{sourceMeta(current.event.source).glyph}</span>
          <span className="font-medium text-text">{current.event.eventType}</span>
          <span className="mono text-faint">{shortId(current.deliveryId)}</span>
          <span className="ml-auto text-xs text-muted">attempt {current.attempt}</span>
        </div>
      )}

      {/* state-dependent actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(state === 'idle' || state === 'acked' || state === 'nacked' || state === 'crashed') && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={doLease}
            disabled={busy || !hasConsumer || !sub}
          >
            <Zap size={14} aria-hidden />
            {longPoll ? 'Start long-poll' : 'Lease next event'}
          </button>
        )}
        {state === 'waiting' && (
          <span className="text-xs text-pending">Long-polling up to 30s for a delivery…</span>
        )}
        {state === 'leased' && (
          <>
            <button type="button" className="btn btn-primary" onClick={doAck} disabled={busy}>
              <CheckCircle2 size={14} aria-hidden />
              ACK
            </button>
            <button type="button" className="btn btn-danger" onClick={doNack} disabled={busy}>
              <Ban size={14} aria-hidden />
              NACK
            </button>
            <button type="button" className="btn btn-ghost" onClick={simulateCrash} disabled={busy}>
              <PlugZap size={14} aria-hidden />
              Simulate crash
            </button>
          </>
        )}
      </div>

      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      {err && <p className="mt-2 text-xs text-dead">{err}</p>}
      {selectedSub && (
        <p className="mt-2 text-[0.7rem] text-faint">
          Visibility timeout {selectedSub.visibilityTimeoutSeconds}s · max {selectedSub.maxAttempts}{' '}
          attempts
        </p>
      )}
    </div>
  );
}
