import { useState } from 'react';
import type { ApiClient } from '../api';
import type { Subscription } from '../types';

export function Subscriptions({
  api,
  subscriptions,
  onChange,
}: {
  api: ApiClient;
  subscriptions: Subscription[];
  onChange: () => void;
}) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [eventType, setEventType] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    try {
      await api.createSubscription({
        name: name || 'subscription',
        filters: { source: source || undefined, eventType: eventType || undefined },
      });
      setName('');
      setSource('');
      setEventType('');
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create');
    }
  }

  return (
    <div className="panel">
      <h2>Subscriptions</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="source filter"
        />
        <input
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          placeholder="eventType filter"
        />
        <button className="btn ghost" onClick={create}>
          Create
        </button>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th>Event type</th>
              <th>Max attempts</th>
              <th>Visibility</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="mono">{s.filters.source ?? '*'}</td>
                <td className="mono">{s.filters.eventType ?? '*'}</td>
                <td>{s.maxAttempts}</td>
                <td>{s.visibilityTimeoutSeconds}s</td>
              </tr>
            ))}
            {subscriptions.length === 0 && (
              <tr>
                <td colSpan={5} className="dim">
                  No subscriptions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
