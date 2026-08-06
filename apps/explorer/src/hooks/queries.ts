import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useApi, useSettings } from '../app/apiContext';
import type { DeliveryListItem, EventListItem, Overview, Subscription } from '../types';

/** Query keys — single place so invalidation stays consistent. */
export const qk = {
  overview: ['overview'] as const,
  subscriptions: ['subscriptions'] as const,
  deliveries: (f: unknown) => ['deliveries', f] as const,
  events: (f: unknown) => ['events', f] as const,
};

export function useOverview() {
  const api = useApi();
  const { adminToken } = useSettings();
  return useQuery<Overview>({
    queryKey: qk.overview,
    queryFn: () => api.overview(),
    enabled: Boolean(adminToken),
    refetchOnWindowFocus: false,
  });
}

export function useSubscriptions() {
  const api = useApi();
  const { adminToken } = useSettings();
  return useQuery<Subscription[]>({
    queryKey: qk.subscriptions,
    queryFn: () => api.subscriptions(),
    enabled: Boolean(adminToken),
    refetchOnWindowFocus: false,
  });
}

export interface DeliveryFilters {
  status?: string;
  subscriptionId?: string;
  source?: string;
}

export function useDeliveries(filters: DeliveryFilters) {
  const api = useApi();
  const { adminToken } = useSettings();
  return useQuery<DeliveryListItem[]>({
    queryKey: qk.deliveries(filters),
    queryFn: () => api.deliveries(filters),
    enabled: Boolean(adminToken),
    refetchOnWindowFocus: false,
  });
}

export interface EventFilters {
  source?: string;
  eventType?: string;
  status?: string;
  search?: string;
}

export function useEvents(filters: EventFilters, enabled = true) {
  const api = useApi();
  const { adminToken } = useSettings();
  return useQuery<EventListItem[]>({
    queryKey: qk.events(filters),
    queryFn: () => api.events(filters),
    enabled: enabled && Boolean(adminToken),
    refetchOnWindowFocus: false,
  });
}

/** Invalidate every server-state query (used on SSE activity + reconnect). */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['overview'] });
    void qc.invalidateQueries({ queryKey: ['subscriptions'] });
    void qc.invalidateQueries({ queryKey: ['deliveries'] });
    void qc.invalidateQueries({ queryKey: ['events'] });
  }, [qc]);
}
