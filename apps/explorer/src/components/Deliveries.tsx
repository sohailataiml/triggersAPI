import { useState } from 'react';
import type { ApiClient } from '../api';
import type { DeliveryDetail, DeliveryListItem, Subscription } from '../types';

const STATUSES = ['', 'PENDING', 'LEASED', 'RETRY_SCHEDULED', 'ACKNOWLEDGED', 'DEAD_LETTER'];

function short(id: string) {
  return id.slice(0, 8);
}
function time(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString() : '—';
}

export function Deliveries({
  api,
  deliveries,
  subscriptions,
  filters,
  setFilters,
  onChange,
}: {
  api: ApiClient;
  deliveries: DeliveryListItem[];
  subscriptions: Subscription[];
  filters: { status: string; subscriptionId: string; source: string };
  setFilters: (f: { status: string; subscriptionId: string; source: string }) => void;
  onChange: () => void;
}) {
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function openDetail(id: string) {
    setErr(null);
    try {
      setDetail(await api.delivery(id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    }
  }

  async function retry(id: string) {
    if (!confirm('Replay this dead-letter delivery back to PENDING?')) return;
    setErr(null);
    try {
      await api.replay(id, 'Replayed from Explorer');
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to replay');
    }
  }

  return (
    <div className="panel">
      <h2>Deliveries</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'all statuses'}
            </option>
          ))}
        </select>
        <select
          value={filters.subscriptionId}
          onChange={(e) => setFilters({ ...filters, subscriptionId: e.target.value })}
        >
          <option value="">all subscriptions</option>
          {subscriptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
          placeholder="source"
        />
        <button className="btn ghost" onClick={onChange}>
          Refresh
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Delivery</th>
              <th>Status</th>
              <th>Source / type</th>
              <th>Att.</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td className="mono" style={{ cursor: 'pointer' }} onClick={() => openDetail(d.id)}>
                  {short(d.id)}
                </td>
                <td>
                  <span className={`badge ${d.status}`}>{d.status}</span>
                </td>
                <td className="mono">
                  {d.event.source} / {d.event.eventType}
                </td>
                <td>{d.attemptCount}</td>
                <td className="dim">{time(d.createdAt)}</td>
                <td>
                  {d.status === 'DEAD_LETTER' ? (
                    <button className="btn danger" onClick={() => retry(d.id)}>
                      Retry Now
                    </button>
                  ) : (
                    <button className="btn ghost" onClick={() => openDetail(d.id)}>
                      Detail
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {deliveries.length === 0 && (
              <tr>
                <td colSpan={6} className="dim">
                  No deliveries match the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && <DetailDrawer detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DetailDrawer({ detail, onClose }: { detail: DeliveryDetail; onClose: () => void }) {
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="drawer">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Delivery detail</h2>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <dl>
          <dt>ID</dt>
          <dd>{detail.id}</dd>
          <dt>Status</dt>
          <dd>
            <span className={`badge ${detail.status}`}>{detail.status}</span>
          </dd>
          <dt>Event ID</dt>
          <dd>{detail.eventId}</dd>
          <dt>Subscription</dt>
          <dd>{detail.subscriptionId}</dd>
          <dt>Attempts</dt>
          <dd>{detail.attemptCount}</dd>
          <dt>Replays</dt>
          <dd>{detail.replayCount}</dd>
          <dt>Available at</dt>
          <dd>{time(detail.availableAt)}</dd>
          <dt>Leased at</dt>
          <dd>{time(detail.leasedAt)}</dd>
          <dt>Lease until</dt>
          <dd>{time(detail.leaseUntil)}</dd>
          <dt>Consumer</dt>
          <dd>{detail.consumerInstanceId ?? '—'}</dd>
          <dt>Acknowledged</dt>
          <dd>{time(detail.acknowledgedAt)}</dd>
          <dt>Dead-lettered</dt>
          <dd>{time(detail.deadLetteredAt)}</dd>
          <dt>Last error</dt>
          <dd>{detail.lastErrorCode ?? '—'}</dd>
          <dt>Error message</dt>
          <dd>{detail.lastErrorMessage ?? '—'}</dd>
        </dl>
      </div>
    </>
  );
}
