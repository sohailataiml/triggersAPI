import { Sparkles, Trash2 } from 'lucide-react';
import { ChatComposer } from './ChatComposer';
import { MessageList } from './MessageList';
import { SuggestedPrompts } from './SuggestedPrompts';
import type { AgentStatus, Capabilities, ChatItem } from '../../types';

export function ChatPanel({
  items,
  status,
  busy,
  capabilities,
  demoMode,
  onSend,
  onCancel,
  onRetry,
  onApprove,
  onDecline,
  onClear,
}: {
  items: ChatItem[];
  status: AgentStatus;
  busy: boolean;
  capabilities: Capabilities | null;
  demoMode: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  onRetry: () => void;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onClear: () => void;
}) {
  const empty = items.length === 0;

  return (
    <section className="panel flex min-h-0 flex-col" aria-label="Copilot conversation">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Sparkles size={14} className="text-accent" aria-hidden />
        <h2 className="text-sm font-medium text-text">Copilot</h2>
        {!empty && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="btn btn-ghost ml-auto h-7 px-2 text-xs text-muted"
          >
            <Trash2 size={12} aria-hidden />
            Clear
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {empty ? (
          <EmptyState demoMode={demoMode} />
        ) : (
          <MessageList
            items={items}
            status={status}
            onRetry={onRetry}
            onApprove={onApprove}
            onDecline={onDecline}
            busy={busy}
          />
        )}
      </div>

      <footer className="space-y-2.5 border-t border-border px-4 py-3">
        <SuggestedPrompts capabilities={capabilities} onPick={onSend} disabled={busy} />
        <ChatComposer onSend={onSend} onCancel={onCancel} busy={busy} disabled={false} />
      </footer>
    </section>
  );
}

function EmptyState({ demoMode }: { demoMode: boolean }) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent shadow-glow">
        <Sparkles size={20} aria-hidden />
      </span>
      <h3 className={`mt-4 font-semibold text-text ${demoMode ? 'text-xl' : 'text-base'}`}>
        Operate TriggersAPI in plain language
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Publish events, lease work from a subscription, acknowledge or reject deliveries, and
        recover dead letters — every action runs as a real MCP tool call against the live platform.
      </p>
      <p className="mt-3 text-xs text-faint">
        Pick a suggestion below, or ask something like “what&apos;s waiting?”
      </p>
    </div>
  );
}
