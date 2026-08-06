import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  useDeleteSubscription,
  useDeliveries,
  useSubscriptions,
  useUpdateSubscription,
} from '../../hooks/queries';
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
  const remove = useDeleteSubscription();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const rollups = useMemo(() => {
    const map = new Map<string, SubscriptionRollup>();
    for (const s of subscriptions) map.set(s.id, rollupFor(deliveries, s.id));
    return map;
  }, [subscriptions, deliveries]);

  // Client-side filter of the cards by name / source / event-type.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subscriptions;
    return subscriptions.filter((s) =>
      [s.name, s.filters.source ?? '', s.filters.eventType ?? ''].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [subscriptions, query]);

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
  async function removeSub(sub: Subscription) {
    setDeletingId(sub.id);
    try {
      await remove.mutateAsync(sub.id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="panel panel-pad">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Subscriptions</h2>
          <p className="text-xs text-muted">Which events fan out to a pull inbox</p>
        </div>
        <div className="flex items-center gap-2">
          {subscriptions.length > 0 && (
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
                aria-hidden
              />
              <input
                className="input h-8 w-40 py-0 pl-7 text-xs"
                placeholder="Search subscriptions…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search subscriptions"
              />
            </div>
          )}
          <button
            type="button"
            className="btn btn-primary h-8 px-3 py-0 text-xs"
            onClick={openCreate}
          >
            <Plus size={13} aria-hidden />
            New subscription
          </button>
        </div>
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
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" hint={`No subscriptions match “${query}”.`} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => (
            <SubscriptionCard
              key={s.id}
              subscription={s}
              rollup={rollups.get(s.id) ?? { pending: 0, latest: null }}
              onEdit={() => openEdit(s)}
              onToggleActive={() => toggleActive(s)}
              onDelete={() => removeSub(s)}
              toggling={togglingId === s.id}
              deleting={deletingId === s.id}
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
