import { useState } from 'react';
import type { Settings } from '../types';

export function SettingsBar({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const [open, setOpen] = useState(!settings.adminToken);
  const [draft, setDraft] = useState(settings);

  if (!open) {
    return (
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn ghost" onClick={() => setOpen(true)}>
          Connection settings
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Connection</h2>
      <p className="dim" style={{ marginTop: 0, fontSize: 12 }}>
        Paste the tokens printed by <code>pnpm db:seed</code>. Stored in this browser only.
      </p>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          style={{ minWidth: 220 }}
          value={draft.apiBase}
          onChange={(e) => setDraft({ ...draft, apiBase: e.target.value })}
          placeholder="API base (blank = same origin)"
        />
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          style={{ flex: 1, minWidth: 320 }}
          value={draft.adminToken}
          onChange={(e) => setDraft({ ...draft, adminToken: e.target.value })}
          placeholder="ADMIN token (trg_…)"
        />
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          style={{ flex: 1, minWidth: 320 }}
          value={draft.producerToken}
          onChange={(e) => setDraft({ ...draft, producerToken: e.target.value })}
          placeholder="PRODUCER token (trg_…)"
        />
      </div>
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            onSave(draft);
            setOpen(false);
          }}
        >
          Save & connect
        </button>
      </div>
    </div>
  );
}
