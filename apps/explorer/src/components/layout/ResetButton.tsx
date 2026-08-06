import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useApi } from '../../app/apiContext';
import { useInvalidateAll } from '../../hooks/queries';
import { useEventStore } from '../../store/eventStore';

/**
 * Clears all events/deliveries for the workspace (keeps subscriptions + keys),
 * then clears the local live feed and refetches. Inline confirm to avoid an
 * accidental wipe mid-demo.
 */
export function ResetButton() {
  const api = useApi();
  const invalidate = useInvalidateAll();
  const clearStore = useEventStore((s) => s.clear);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function doReset() {
    setBusy(true);
    setErr(false);
    try {
      await api.reset();
      clearStore();
      invalidate();
      setConfirming(false);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-dead/40 bg-dead/10 px-2 py-1 text-xs">
        <span className="text-dead">Clear all events?</span>
        <button
          type="button"
          className="btn btn-danger h-6 px-2 py-0 text-xs"
          onClick={doReset}
          disabled={busy}
        >
          {busy ? '…' : err ? 'Retry' : 'Confirm'}
        </button>
        <button
          type="button"
          className="btn btn-ghost h-6 px-2 py-0 text-xs"
          onClick={() => setConfirming(false)}
          disabled={busy}
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="btn btn-ghost h-8 px-2.5"
      title="Clear all events/deliveries (keeps subscriptions + keys)"
    >
      <RotateCcw size={15} aria-hidden />
      <span className="hidden sm:inline">Reset</span>
    </button>
  );
}
