import { useEffect } from 'react';
import { Minimize2, Radio } from 'lucide-react';
import { LivePipeline } from '../dashboard/LivePipeline';
import { EventFocusCard } from './EventFocusCard';
import { useRecentEvents } from '../../hooks/useRecentEvents';
import { useEventStore } from '../../store/eventStore';
import { sourceMeta } from '../../lib/samples';
import { shortId } from '../../lib/format';

/**
 * Full-screen presentation mode. Enlarges the pipeline and pins a focus panel
 * for the selected event with live lease/retry countdowns and its attempt
 * timeline. Secondary controls (nav, forms) are intentionally hidden.
 */
export function DemoMode({
  open,
  onClose,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const events = useRecentEvents();
  const connected = useEventStore((s) => s.connected);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Auto-focus the newest event if nothing is selected.
  useEffect(() => {
    if (open && !selectedId && events[0]) onSelect(events[0].eventId);
  }, [open, selectedId, events, onSelect]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-auto bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="Pipeline demo mode"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-bg/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-accent/40 bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
            DEMO MODE
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Radio size={13} className={connected ? 'text-ack' : 'text-faint'} aria-hidden />
            {connected ? 'live SSE' : 'offline'}
          </span>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          <Minimize2 size={15} aria-hidden />
          Exit demo (Esc)
        </button>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-6">
        <div className="panel panel-pad">
          <LivePipeline
            selectedId={selectedId}
            onSelect={onSelect}
            size="demo"
            showHeader={false}
          />
        </div>

        {/* recent-event selector */}
        {events.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted">Recent:</span>
            {events.slice(0, 8).map((e) => (
              <button
                key={e.eventId}
                type="button"
                onClick={() => onSelect(e.eventId)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  e.eventId === selectedId
                    ? 'border-accent/50 bg-accent-soft text-accent'
                    : 'border-border bg-surface-2/60 text-muted hover:text-text'
                }`}
              >
                <span aria-hidden>{sourceMeta(e.source).glyph}</span>
                {e.eventType}
                <span className="mono text-faint">{shortId(e.eventId)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="panel panel-pad">
          <EventFocusCard eventId={selectedId} />
        </div>
      </div>
    </div>
  );
}
