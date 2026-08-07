import { useEffect, useMemo, useState } from 'react';
import { Command } from 'lucide-react';
import type { Capabilities } from '../types';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
  /** Tool that must be registered for this command to appear. */
  requires?: string;
}

/**
 * Cmd/Ctrl+K quick actions. Purely a shortcut over things already reachable in
 * the UI, so it never becomes the only path to an action.
 */
export function CommandPalette({
  commands,
  capabilities,
}: {
  commands: PaletteCommand[];
  capabilities: Capabilities | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery('');
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const available = capabilities?.mcp.toolNames ?? [];
  const visible = useMemo(
    () =>
      commands
        .filter((command) => !command.requires || available.includes(command.requires))
        .filter((command) => command.label.toLowerCase().includes(query.toLowerCase())),
    [commands, available, query],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg/70 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-border-strong bg-surface shadow-pop"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Command size={14} className="text-faint" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Run a command…"
            aria-label="Search commands"
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-faint"
          />
        </div>

        {visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-faint">No matching commands.</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto py-1">
            {visible.map((command) => (
              <li key={command.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    command.run();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted transition hover:bg-surface-2 hover:text-text"
                >
                  <span className="flex-1 truncate">{command.label}</span>
                  {command.hint && <span className="text-xs text-faint">{command.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
