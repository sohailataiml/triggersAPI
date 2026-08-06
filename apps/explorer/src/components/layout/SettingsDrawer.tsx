import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';
import { Drawer } from '../shared/Drawer';
import type { Settings } from '../../types';

const TOKEN_FIELDS: Array<{ key: keyof Settings; label: string; hint: string }> = [
  { key: 'adminToken', label: 'ADMIN token', hint: 'Overview, deliveries, replay, SSE' },
  { key: 'producerToken', label: 'PRODUCER token', hint: 'Ingest events' },
  { key: 'consumerToken', label: 'CONSUMER token', hint: 'Lease, ACK, NACK' },
];

/** Last 4 chars of a saved token — a non-sensitive way to confirm which key. */
function tail(value: string): string {
  return value ? `saved · …${value.slice(-4)}` : 'not set';
}

/** Masked token input with a reveal toggle. Defaults to hidden (password). */
function TokenField({
  label,
  hint,
  value,
  saved,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  saved: string;
  onChange: (v: string) => void;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="block">
      <span className="flex items-center justify-between">
        <span className="field-label">{label}</span>
        <span className="text-[0.7rem] text-faint">{tail(saved)}</span>
      </span>
      <span className="relative mt-1 block">
        <input
          className="input pr-9 font-mono"
          type={reveal ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder="trg_…"
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted transition hover:text-text"
          aria-label={reveal ? 'Hide token' : 'Reveal token'}
          title={reveal ? 'Hide token' : 'Reveal token'}
        >
          {reveal ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        </button>
      </span>
      <span className="mt-1 block text-[0.7rem] text-faint">{hint}</span>
    </label>
  );
}

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

  // Re-sync the draft when the drawer (re)opens with fresh saved settings.
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Connection settings"
      subtitle="Tokens are stored in this browser only"
    >
      <p className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted">
        <KeyRound size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        Paste the tokens printed by{' '}
        <code className="mx-1 rounded bg-bg px-1 font-mono">pnpm db:seed</code>.
      </p>
      <p className="mb-4 flex items-start gap-2 rounded-lg border border-leased/30 bg-leased/10 px-3 py-2 text-xs text-leased">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
        These are demo credentials — keep them out of source control, screenshots, and shared docs.
        They live only in this browser's localStorage.
      </p>

      <div className="space-y-3">
        <label className="block">
          <span className="field-label">API base</span>
          <input
            className="input mt-1"
            value={draft.apiBase}
            placeholder="https://…  (blank = same origin)"
            onChange={(e) => setDraft({ ...draft, apiBase: e.target.value })}
          />
          <span className="mt-1 block text-[0.7rem] text-faint">
            Blank = same origin (Vite proxy)
          </span>
        </label>

        {TOKEN_FIELDS.map((f) => (
          <TokenField
            key={f.key}
            label={f.label}
            hint={f.hint}
            value={draft[f.key]}
            saved={settings[f.key]}
            onChange={(v) => setDraft({ ...draft, [f.key]: v })}
          />
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
