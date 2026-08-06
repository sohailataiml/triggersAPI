import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

/** Neutral empty state for panels with no data yet. */
export function EmptyState({
  icon,
  title,
  hint,
  children,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <div className="text-faint">{icon ?? <Inbox size={22} aria-hidden />}</div>
      <div className="text-sm font-medium text-muted">{title}</div>
      {hint && <div className="max-w-xs text-xs text-faint">{hint}</div>}
      {children}
    </div>
  );
}

/** Inline error surface with the API message. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dead/40 bg-dead/10 px-3 py-2 text-sm text-dead">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-ghost h-7 px-2 py-0 text-xs">
          Retry
        </button>
      )}
    </div>
  );
}

/** Shimmer skeleton rows for loading lists. */
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-2/70" />
      ))}
    </div>
  );
}

/** Small inline spinner + label. */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 size={15} className="animate-spin" aria-hidden />
      {label}
    </div>
  );
}
