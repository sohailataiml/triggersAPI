import { useState } from 'react';
import { Filter, Inbox, Pencil, Power, Trash2 } from 'lucide-react';
import { StatusBadge } from '../shared/StatusBadge';
import { relativeTime } from '../../lib/format';
import type { DeliveryListItem, Subscription } from '../../types';

export interface SubscriptionRollup {
  pending: number;
  latest: DeliveryListItem | null;
}

/**
 * Subscription card: filters, delivery mode, active state, and a live rollup
 * (pending count + latest delivery) derived from the deliveries list. Secrets
 * are never part of a subscription, so nothing sensitive is shown.
 */
export function SubscriptionCard({
  subscription,
  rollup,
  onEdit,
  onToggleActive,
  onDelete,
  toggling,
  deleting,
}: {
  subscription: Subscription;
  rollup: SubscriptionRollup;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  toggling: boolean;
  deleting: boolean;
}) {
  const { filters, isActive, visibilityTimeoutSeconds, maxAttempts, name } = subscription;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="panel panel-pad flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">{name}</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-[0.7rem] text-muted">
            <Inbox size={11} aria-hidden /> Pull inbox
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.7rem] font-medium ${
            isActive
              ? 'border-ack/30 bg-ack/10 text-ack'
              : 'border-border-strong bg-surface-2 text-muted'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-ack' : 'bg-faint'}`}
            aria-hidden
          />
          {isActive ? 'Active' : 'Paused'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2/50 px-2 py-0.5 text-xs text-muted">
          <Filter size={11} aria-hidden />
          source: <span className="mono text-text">{filters.source ?? '*'}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2/50 px-2 py-0.5 text-xs text-muted">
          type: <span className="mono text-text">{filters.eventType ?? '*'}</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-border bg-bg/40 px-2 py-1.5">
          <div className="text-sm font-semibold tabular-nums text-pending">{rollup.pending}</div>
          <div className="text-[0.65rem] uppercase tracking-wide text-faint">pending</div>
        </div>
        <div className="rounded-lg border border-border bg-bg/40 px-2 py-1.5">
          <div className="text-sm font-semibold tabular-nums text-text">
            {visibilityTimeoutSeconds}s
          </div>
          <div className="text-[0.65rem] uppercase tracking-wide text-faint">visibility</div>
        </div>
        <div className="rounded-lg border border-border bg-bg/40 px-2 py-1.5">
          <div className="text-sm font-semibold tabular-nums text-text">{maxAttempts}</div>
          <div className="text-[0.65rem] uppercase tracking-wide text-faint">max tries</div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted">
        <span>Latest:</span>
        {rollup.latest ? (
          <>
            <StatusBadge status={rollup.latest.status} size="sm" />
            <span className="text-faint">{relativeTime(rollup.latest.createdAt)}</span>
          </>
        ) : (
          <span className="text-faint">no deliveries yet</span>
        )}
      </div>

      {confirmingDelete ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 rounded-lg border border-dead/40 bg-dead/10 px-2 py-1.5 pt-1">
          <span className="text-xs text-dead">Delete this subscription?</span>
          <button
            type="button"
            className="btn btn-danger h-7 px-2 py-0 text-xs"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Confirm'}
          </button>
          <button
            type="button"
            className="btn btn-ghost h-7 px-2 py-0 text-xs"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-auto flex gap-2 pt-1">
          <button
            type="button"
            className="btn btn-ghost h-8 flex-1 px-2 py-0 text-xs"
            onClick={onEdit}
          >
            <Pencil size={12} aria-hidden />
            Edit
          </button>
          <button
            type="button"
            className="btn btn-ghost h-8 px-2 py-0 text-xs"
            onClick={onToggleActive}
            disabled={toggling}
            title={isActive ? 'Pause (isActive=false)' : 'Resume (isActive=true)'}
          >
            <Power size={12} aria-hidden />
            {isActive ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            className="btn btn-ghost h-8 px-2 py-0 text-xs text-dead hover:border-dead/50"
            onClick={() => setConfirmingDelete(true)}
            title="Delete subscription"
            aria-label="Delete subscription"
          >
            <Trash2 size={12} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
