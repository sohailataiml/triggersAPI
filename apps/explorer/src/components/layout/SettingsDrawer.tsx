import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Drawer } from '../shared/Drawer';
import type { Settings } from '../../types';

const ROLE_FIELDS: Array<{ key: keyof Settings; label: string; hint: string }> = [
  { key: 'apiBase', label: 'API base', hint: 'Blank = same origin (Vite proxy)' },
  { key: 'adminToken', label: 'ADMIN token', hint: 'Overview, deliveries, replay, SSE' },
  { key: 'producerToken', label: 'PRODUCER token', hint: 'Ingest events' },
  { key: 'consumerToken', label: 'CONSUMER token', hint: 'Lease, ACK, NACK' },
];

export function SettingsDrawer({
  open,
  settings,
  onClose,
  onSave,
}: {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
}) {
  const [draft, setDraft] = useState(settings);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Connection settings"
      subtitle="Tokens are stored in this browser only"
    >
      <p className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted">
        <KeyRound size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        Paste the tokens printed by{' '}
        <code className="mx-1 rounded bg-bg px-1 font-mono">pnpm db:seed</code>.
      </p>

      <div className="space-y-3">
        {ROLE_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="field-label">{f.label}</span>
            <input
              className="input mt-1 font-mono"
              value={draft[f.key]}
              placeholder={f.key === 'apiBase' ? 'https://…  (optional)' : 'trg_…'}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
            <span className="mt-1 block text-[0.7rem] text-faint">{f.hint}</span>
          </label>
        ))}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            onSave(draft);
            onClose();
          }}
        >
          Save &amp; connect
        </button>
      </div>
    </Drawer>
  );
}
