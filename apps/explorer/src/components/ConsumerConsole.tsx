import { useState } from 'react';
import type { ApiClient } from '../api';
import type { LeasedItem, Subscription } from '../types';

/**
 * In-browser reference consumer: lease deliveries from a subscription, then
 * ACK or NACK each one. ACK uses a stable per-delivery process id so a repeat
 * ACK demonstrates idempotency. Real consumers would be external code — this
 * panel exists for manual testing and demos.
 */
export function ConsumerConsole({
  api,
  subscriptions,
  hasToken,
  onChange,
}: {
  api: ApiClient;
  subscriptions: Subscription[];
  hasToken: boolean;
  onChange: () => void;
}) {
  const [subscriptionId, setSubscriptionId] = useState('');
  const [longPoll, setLongPoll] = useState(false);
  const [items, setItems] = useState<LeasedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sub = subscriptionId || subscriptions[0]?.id || '';

  async function lease() {
    if (!sub) return;
    setErr(null);
    setNote(null);
    setBusy(true);
    try {
      const res = await api.lease(sub, longPoll ? 30 : 0);
      setItems((prev) => mergeById(prev, res.items));
      if (res.items.length === 0) setNote('No deliveries available.');
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lease failed');
    } finally {
      setBusy(false);
    }
  }

  async function ack(item: LeasedItem) {
    setErr(null);
    try {
      const res = (await api.ack(
        item.deliveryId,
        item.leaseToken,
        `explorer-${item.deliveryId}`,
      )) as { duplicateAck?: boolean };
      setNote(res.duplicateAck ? 'ACK was idempotent (duplicateAck).' : 'Acknowledged.');
      setItems((prev) => prev.filter((i) => i.deliveryId !== item.deliveryId));
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ACK failed');
    }
  }

  async function nack(item: LeasedItem) {
    setErr(null);
    try {
      await api.nack(item.deliveryId, item.leaseToken, 'processing_failed');
      setNote('NACKed (retry scheduled or dead-lettered).');
      setItems((prev) => prev.filter((i) => i.deliveryId !== item.deliveryId));
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'NACK failed');
    }
  }

  return (
    <div className="panel">
      <h2>Consumer console</h2>
      {!hasToken && (
        <div className="setup-note" style={{ marginBottom: 12 }}>
          Add a <b>CONSUMER</b> token in Connection settings to lease and ACK deliveries.
        </div>
      )}
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={sub} onChange={(e) => setSubscriptionId(e.target.value)}>
          {subscriptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="dim" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={longPoll}
            onChange={(e) => setLongPoll(e.target.checked)}
          />
          long-poll 30s
        </label>
        <button className="btn" onClick={lease} disabled={busy || !hasToken || !sub}>
          {busy ? 'Leasing…' : 'Lease'}
        </button>
      </div>
      {note && (
        <div className="dim" style={{ marginBottom: 8 }}>
          {note}
        </div>
      )}
      {err && <div className="err">{err}</div>}

      {items.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Delivery</th>
                <th>Event</th>
                <th>Att.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.deliveryId}>
                  <td className="mono">{item.deliveryId.slice(0, 8)}</td>
                  <td className="mono">
                    {item.event.source} / {item.event.eventType}
                  </td>
                  <td>{item.attempt}</td>
                  <td>
                    <div className="row">
                      <button className="btn" onClick={() => ack(item)}>
                        ACK
                      </button>
                      <button className="btn danger" onClick={() => nack(item)}>
                        NACK
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Merge newly leased items into the held list, de-duplicating by delivery id. */
function mergeById(prev: LeasedItem[], next: LeasedItem[]): LeasedItem[] {
  const seen = new Set(prev.map((i) => i.deliveryId));
  return [...prev, ...next.filter((i) => !seen.has(i.deliveryId))];
}
