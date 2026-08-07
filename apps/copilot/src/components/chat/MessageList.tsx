import { useEffect, useRef } from 'react';
import { AssistantMessage } from './AssistantMessage';
import { ConfirmCard } from './ConfirmCard';
import { ErrorCard } from './ErrorCard';
import { ToolCallCard } from './ToolCallCard';
import type { AgentStatus, ChatItem } from '../../types';

function StatusLine({ status }: { status: AgentStatus }) {
  const label =
    status === 'calling_tool'
      ? 'Running MCP tool'
      : status === 'responding'
        ? 'Responding'
        : 'Working';

  return (
    <p className="flex items-center gap-2 py-1 text-sm text-faint" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/70"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      {label}…
    </p>
  );
}

export function MessageList({
  items,
  status,
  onRetry,
  onApprove,
  onDecline,
  busy,
}: {
  items: ChatItem[];
  status: AgentStatus;
  onRetry: () => void;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  busy: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows, without fighting a user who scrolls up.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [items.length, status]);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        switch (item.kind) {
          case 'user':
            return (
              <div key={item.id} className="flex justify-end">
                <div className="bubble-user max-w-[85%] whitespace-pre-wrap">{item.text}</div>
              </div>
            );
          case 'assistant':
            return <AssistantMessage key={item.id} text={item.text} streaming={item.streaming} />;
          case 'tool':
            return <ToolCallCard key={item.id} item={item} />;
          case 'confirm':
            return (
              <ConfirmCard
                key={item.id}
                item={item}
                onApprove={onApprove}
                onDecline={onDecline}
                disabled={busy}
              />
            );
          case 'error':
            return (
              <ErrorCard key={item.id} error={item.error} onRetry={onRetry} canRetry={!busy} />
            );
          default:
            return null;
        }
      })}

      {status !== 'idle' && <StatusLine status={status} />}
      <div ref={endRef} />
    </div>
  );
}
