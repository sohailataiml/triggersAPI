import { ShieldAlert } from 'lucide-react';
import { JsonViewer } from '../shared/JsonViewer';
import type { ChatItem } from '../../types';

type ConfirmItem = Extract<ChatItem, { kind: 'confirm' }>;

/**
 * Gate for destructive or broad admin actions. The agent has already been told
 * it may not run this tool; approving here adds the call's fingerprint to the
 * session and re-runs the turn, so consent applies to exactly the action shown.
 */
export function ConfirmCard({
  item,
  onApprove,
  onDecline,
  disabled,
}: {
  item: ConfirmItem;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="animate-fade-up rounded-xl border border-dead/40 bg-dead/5 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-dead/40 bg-dead/10 text-dead">
          <ShieldAlert size={13} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">Confirmation required</p>
          <p className="mt-0.5 text-sm text-muted">
            <span className="mono text-text">{item.name}</span> changes or removes data and was not
            executed. Review the arguments and approve if this is what you want.
          </p>

          <div className="mt-2.5">
            <JsonViewer value={item.args} maxHeight={160} />
          </div>

          {item.resolved === 'pending' ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-danger h-8"
                disabled={disabled}
                onClick={() => onApprove(item.id)}
              >
                Approve and run
              </button>
              <button
                type="button"
                className="btn h-8"
                disabled={disabled}
                onClick={() => onDecline(item.id)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-faint">
              {item.resolved === 'approved' ? 'Approved by you' : 'Declined'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
