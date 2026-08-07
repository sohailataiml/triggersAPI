import { useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { CopilotErrorShape } from '../../types';

/**
 * A failure the user can act on. The headline is always plain language; raw
 * technical text is available only when the server is running in development,
 * which is why `detail` is absent from production payloads entirely.
 */
export function ErrorCard({
  error,
  onRetry,
  canRetry,
}: {
  error: CopilotErrorShape;
  onRetry: () => void;
  canRetry: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);

  const title =
    error.kind === 'mcp_unavailable'
      ? 'Cannot reach the MCP server'
      : error.kind === 'mcp_timeout'
        ? 'The operation timed out'
        : error.kind === 'llm_unavailable'
          ? 'Model provider unavailable'
          : error.kind === 'llm_refusal'
            ? 'Request declined'
            : error.kind === 'not_configured'
              ? 'Copilot is not configured'
              : error.kind === 'tool_failed'
                ? 'The operation did not complete'
                : 'Something went wrong';

  return (
    <div className="animate-fade-up rounded-xl border border-dead/40 bg-dead/5 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-dead/40 bg-dead/10 text-dead">
          <AlertTriangle size={13} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className="mt-0.5 text-sm text-muted">{error.message}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {error.retryable && canRetry && (
              <button type="button" className="btn h-8" onClick={onRetry}>
                <RotateCcw size={13} aria-hidden />
                Retry
              </button>
            )}
            {error.detail && (
              <button
                type="button"
                className="btn btn-ghost h-8 text-xs text-faint"
                onClick={() => setShowDetail((value) => !value)}
                aria-expanded={showDetail}
              >
                {showDetail ? 'Hide' : 'Show'} technical detail
              </button>
            )}
          </div>

          {showDetail && error.detail && (
            <pre className="mono mt-2 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-bg/70 p-2.5 text-faint">
              {error.detail}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
