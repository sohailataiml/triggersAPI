import { useState } from 'react';
import type { ApiClient } from '../api';

export function IngestForm({ api, onIngested }: { api: ApiClient; onIngested: () => void }) {
  const [source, setSource] = useState('github');
  const [eventType, setEventType] = useState('pull_request.opened');
  const [subject, setSubject] = useState('repo:acme/widgets');
  const [payload, setPayload] = useState('{"pullRequestId": 431}');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const parsed = JSON.parse(payload || '{}');
      await api.ingest({ source, eventType, subject: subject || undefined, payload: parsed });
      onIngested();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to ingest');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Ingest event</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="source" />
        <input
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          placeholder="eventType"
          style={{ minWidth: 180 }}
        />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="subject" />
      </div>
      <input
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        placeholder="payload JSON"
        style={{ width: '100%', marginBottom: 8 }}
      />
      <button className="btn" onClick={submit} disabled={busy}>
        {busy ? 'Sending…' : 'POST /v1/events'}
      </button>
      {err && <div className="err">{err}</div>}
    </div>
  );
}
