import { Check, Plug, RefreshCw, X } from 'lucide-react';
import type { Capabilities, TriggersRole } from '../types';

const ROLE_LABELS: Array<{ role: TriggersRole; label: string; hint: string }> = [
  { role: 'producer', label: 'Producer', hint: 'Publish events' },
  { role: 'consumer', label: 'Consumer', hint: 'Lease, acknowledge, reject' },
  { role: 'admin', label: 'Admin', hint: 'Replay, manage subscriptions' },
];

/**
 * What this connection can actually do, derived from the MCP server's own tool
 * list. Nothing is advertised that is not registered — a capability shown with
 * a cross is a capability the agent will decline, not one it will fumble.
 */
export function CapabilityStrip({
  capabilities,
  onReconnect,
  reconnecting,
}: {
  capabilities: Capabilities | null;
  onReconnect: () => void;
  reconnecting: boolean;
}) {
  const mcp = capabilities?.mcp;
  const connected = Boolean(mcp?.connected);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface/40 px-4 py-2 text-xs sm:px-6">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Plug size={13} aria-hidden className={connected ? 'text-ack' : 'text-dead'} />
        <span className={connected ? 'text-ack' : 'text-dead'}>
          {connected ? 'MCP connected' : 'MCP disconnected'}
        </span>
        {mcp?.serverName && (
          <span className="mono text-faint">
            {mcp.serverName} v{mcp.serverVersion}
          </span>
        )}
      </span>

      <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />

      <span className="flex flex-wrap items-center gap-3">
        {ROLE_LABELS.map(({ role, label, hint }) => {
          const enabled = Boolean(mcp?.roles[role]);
          return (
            <span
              key={role}
              title={enabled ? hint : `${hint} — credential not configured`}
              className={`inline-flex items-center gap-1 ${enabled ? 'text-muted' : 'text-faint line-through decoration-faint/50'}`}
            >
              {enabled ? (
                <Check size={12} className="text-ack" aria-hidden />
              ) : (
                <X size={12} className="text-faint" aria-hidden />
              )}
              {label}
            </span>
          );
        })}
      </span>

      {mcp && mcp.toolNames.length > 0 && (
        <>
          <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
          <span className="text-faint" title={mcp.toolNames.join(', ')}>
            {mcp.toolNames.length} tools · {mcp.resourceUris.length} resources
          </span>
        </>
      )}

      {capabilities?.llm.configured && (
        <>
          <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
          <span className="mono text-faint">
            {capabilities.llm.model} · effort {capabilities.llm.effort}
          </span>
        </>
      )}

      <button
        type="button"
        onClick={onReconnect}
        disabled={reconnecting}
        className="btn btn-ghost ml-auto h-7 px-2 text-xs text-muted"
      >
        <RefreshCw size={12} aria-hidden className={reconnecting ? 'animate-spin' : ''} />
        Reconnect
      </button>

      {mcp?.error && (
        <p className="w-full text-dead" role="status">
          {mcp.error}
        </p>
      )}
    </div>
  );
}
