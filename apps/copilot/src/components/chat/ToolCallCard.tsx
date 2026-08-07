import { useState } from 'react';
import { AlertTriangle, ChevronRight, CircleCheck, Loader2, Wrench } from 'lucide-react';
import { formatDuration, humanizeToolName } from '../../lib/format';
import { JsonViewer } from '../shared/JsonViewer';
import type { ChatItem } from '../../types';

type ToolItem = Extract<ChatItem, { kind: 'tool' }>;

const STATUS_META = {
  running: { label: 'Running', className: 'border-leased/30 bg-leased/10 text-leased' },
  succeeded: { label: 'Succeeded', className: 'border-ack/30 bg-ack/10 text-ack' },
  failed: { label: 'Failed', className: 'border-dead/30 bg-dead/10 text-dead' },
} as const;

/**
 * The MCP tool call, shown in full because that transparency is the point of
 * this demo: the judge should be able to see exactly which tool ran, with what
 * arguments, and what the platform actually returned.
 *
 * Arguments and results arrive already redacted from the server — lease tokens
 * and credentials never reach this component.
 */
export function ToolCallCard({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[item.status];

  return (
    <div className="tool-card animate-fade-up">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-surface-2"
      >
        <ChevronRight
          size={14}
          aria-hidden
          className={`shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border-strong bg-bg/60 text-accent">
          <Wrench size={12} aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="mono font-medium text-text">{item.name}</span>
            {item.mutating && (
              <span className="rounded border border-border-strong px-1.5 py-px text-[0.65rem] uppercase tracking-wide text-muted">
                changes state
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-faint">
            {humanizeToolName(item.name)} via MCP
          </span>
        </span>

        {item.durationMs !== undefined && (
          <span className="mono shrink-0 text-xs text-faint">
            {formatDuration(item.durationMs)}
          </span>
        )}
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}
        >
          {item.status === 'running' ? (
            <Loader2 size={11} className="animate-spin" aria-hidden />
          ) : item.status === 'succeeded' ? (
            <CircleCheck size={11} aria-hidden />
          ) : (
            <AlertTriangle size={11} aria-hidden />
          )}
          {meta.label}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">
          <div>
            <p className="field-label mb-1.5">Arguments</p>
            <JsonViewer value={item.args} maxHeight={200} />
          </div>

          {item.status !== 'running' && (
            <div>
              <p className="field-label mb-1.5">{item.status === 'failed' ? 'Error' : 'Result'}</p>
              {item.status === 'failed' ? (
                <p className="rounded-lg border border-dead/30 bg-dead/10 px-3 py-2 text-sm text-dead">
                  {item.error ?? 'The tool reported a failure.'}
                </p>
              ) : (
                <JsonViewer value={item.result} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
