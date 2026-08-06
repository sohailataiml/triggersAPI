import { useEffect, useState } from 'react';
import { useCreateSubscription, useUpdateSubscription } from '../../hooks/queries';
import { Drawer } from '../shared/Drawer';
import { ErrorState } from '../shared/States';
import type { Subscription } from '../../types';

interface FormState {
  name: string;
  source: string;
  eventType: string;
  visibilityTimeoutSeconds: number;
  maxAttempts: number;
}

function toForm(sub: Subscription | null): FormState {
  return {
    name: sub?.name ?? '',
    source: sub?.filters.source ?? '',
    eventType: sub?.filters.eventType ?? '',
    visibilityTimeoutSeconds: sub?.visibilityTimeoutSeconds ?? 30,
    maxAttempts: sub?.maxAttempts ?? 5,
  };
}

/** Create or edit a subscription. Pull inbox is the only delivery mode today. */
export function SubscriptionFormDrawer({
  open,
  subscription,
  onClose,
}: {
  open: boolean;
  subscription: Subscription | null;
  onClose: () => void;
}) {
  const isEdit = Boolean(subscription);
  const [form, setForm] = useState<FormState>(() => toForm(subscription));
  const [err, setErr] = useState<string | null>(null);

  const create = useCreateSubscription();
  const update = useUpdateSubscription();
  const busy = create.isPending || update.isPending;

  // Reset the form whenever the target subscription changes.
  useEffect(() => {
    if (open) {
      setForm(toForm(subscription));
      setErr(null);
    }
  }, [open, subscription]);

  async function save() {
    setErr(null);
    if (!form.name.trim()) {
      setErr('Name is required');
      return;
    }
    const filters = {
      source: form.source.trim() || null,
      eventType: form.eventType.trim() || null,
    };
    try {
      if (isEdit && subscription) {
        await update.mutateAsync({
          id: subscription.id,
          patch: {
            name: form.name.trim(),
            filters,
            visibilityTimeoutSeconds: form.visibilityTimeoutSeconds,
            maxAttempts: form.maxAttempts,
          },
        });
      } else {
        await create.mutateAsync({
          name: form.name.trim(),
          filters,
          visibilityTimeoutSeconds: form.visibilityTimeoutSeconds,
          maxAttempts: form.maxAttempts,
        });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save subscription');
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={440}
      title={isEdit ? 'Edit subscription' : 'New subscription'}
      subtitle={isEdit ? subscription?.name : 'Route matching events to a pull inbox'}
    >
      <div className="space-y-3">
        <label className="block">
          <span className="field-label">Name</span>
          <input
            className="input mt-1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="GitHub pull requests"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="field-label">Source filter</span>
            <input
              className="input mt-1"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="any"
            />
          </label>
          <label className="block">
            <span className="field-label">Event type filter</span>
            <input
              className="input mt-1"
              value={form.eventType}
              onChange={(e) => setForm({ ...form, eventType: e.target.value })}
              placeholder="any"
            />
          </label>
        </div>
        <p className="text-[0.7rem] text-faint">Leave a filter blank to match everything.</p>

        <label className="block">
          <span className="field-label">Delivery mode</span>
          <select className="input mt-1" value="pull" disabled aria-label="Delivery mode">
            <option value="pull">Pull inbox</option>
            <option value="push" disabled>
              Webhook push (not yet available)
            </option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="field-label">Visibility timeout (s)</span>
            <input
              type="number"
              min={1}
              max={3600}
              className="input mt-1 tabular-nums"
              value={form.visibilityTimeoutSeconds}
              onChange={(e) =>
                setForm({ ...form, visibilityTimeoutSeconds: Number(e.target.value) })
              }
            />
          </label>
          <label className="block">
            <span className="field-label">Max attempts</span>
            <input
              type="number"
              min={1}
              max={50}
              className="input mt-1 tabular-nums"
              value={form.maxAttempts}
              onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })}
            />
          </label>
        </div>
      </div>

      {err && (
        <div className="mt-3">
          <ErrorState message={err} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create subscription'}
        </button>
      </div>
    </Drawer>
  );
}
