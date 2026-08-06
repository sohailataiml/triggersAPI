import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useDeliveries, useSubscriptions, useUpdateSubscription } from '../../hooks/queries';
import { SubscriptionCard, type SubscriptionRollup } from './SubscriptionCard';
import { SubscriptionFormDrawer } from './SubscriptionFormDrawer';
import { EmptyState, ErrorState, LoadingSkeleton } from '../shared/States';
import type { DeliveryListItem, Subscription } from '../../types';

/** Compute pending count + latest delivery per subscription from the list. */
function rollupFor(deliveries: DeliveryListItem[], subscriptionId: string): SubscriptionRollup {
  let pending = 0;
  let latest: DeliveryListItem | null = null;
  for (const d of deliveries) {
    if (d.subscriptionId !== subscriptionId) continue;
    if (d.status === 'PENDING' || d.status === 'RETRY_SCHEDULED') pending += 1;
    if (!latest || new Date(d.createdAt) > new Date(latest.createdAt)) latest = d;
  }
  return { pending, latest };
}

export function SubscriptionsPanel() {
  const { data: subscriptions = [], isLoading, error, refetch } = useSubscriptions();
  const { data: deliveries = [] } = useDeliveries({});
  const update = useUpdateSubscription();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const rollups = useMemo(() => {
    const map = new Map<string, SubscriptionRollup>();
    for (const s of subscriptions) map.set(s.id, rollupFor(deliveries, s.id));
    return map;
  }, [subscriptions, deliveries]);

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }
  function openEdit(sub: Subscription) {
    setEditing(sub);
    setDrawerOpen(true);
  }
  async function toggleActive(sub: Subscription) {
    setTogglingId(sub.id);
    try {
      await update.mutateAsync({ id: sub.id, patch: { isActive: !sub.isActive } });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="panel panel-pad">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Subscriptions</h2>
          <p className="text-xs text-muted">Which events fan out to a pull inbox</p>
        </div>
        <button
          type="button"
          className="btn btn-primary h-8 px-3 py-0 text-xs"
          onClick={openCreate}
        >
          <Plus size={13} aria-hidden />
          New subscription
        </button>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : error ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load subscriptions'}
          onRetry={() => void refetch()}
        />
      ) : subscriptions.length === 0 ? (
        <EmptyState
          title="No subscriptions"
          hint="Create one to start routing events to a consumer."
        >
          <button type="button" className="btn btn-primary mt-2" onClick={openCreate}>
            <Plus size={14} aria-hidden />
            New subscription
          </button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {subscriptions.map((s) => (
            <SubscriptionCard
              key={s.id}
              subscription={s}
              rollup={rollups.get(s.id) ?? { pending: 0, latest: null }}
              onEdit={() => openEdit(s)}
              onToggleActive={() => toggleActive(s)}
              toggling={togglingId === s.id}
            />
          ))}
        </div>
      )}

      <SubscriptionFormDrawer
        open={drawerOpen}
        subscription={editing}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
