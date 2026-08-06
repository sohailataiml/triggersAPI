import type {
  DeliveryDetail,
  DeliveryListItem,
  LeasedItem,
  Overview,
  Settings,
  Subscription,
} from './types';

/** Thin API client. Uses same-origin paths (Vite proxies /v1 to the API). */
export class ApiClient {
  constructor(private readonly settings: Settings) {}

  private async request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.settings.apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = body?.error?.message ?? `Request failed (${res.status})`;
      throw new Error(message);
    }
    return body.data as T;
  }

  overview(): Promise<Overview> {
    return this.request('/v1/explorer/overview', this.settings.adminToken);
  }

  subscriptions(): Promise<Subscription[]> {
    return this.request('/v1/subscriptions', this.settings.adminToken);
  }

  createSubscription(input: {
    name: string;
    filters: { source?: string; eventType?: string; subject?: string };
  }): Promise<Subscription> {
    return this.request('/v1/subscriptions', this.settings.adminToken, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  deliveries(params: {
    status?: string;
    subscriptionId?: string;
    source?: string;
    eventType?: string;
  }): Promise<DeliveryListItem[]> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const qs = q.toString();
    return this.request(`/v1/deliveries${qs ? `?${qs}` : ''}`, this.settings.adminToken);
  }

  delivery(id: string): Promise<DeliveryDetail> {
    return this.request(`/v1/deliveries/${id}`, this.settings.adminToken);
  }

  ingest(input: {
    source: string;
    eventType: string;
    subject?: string;
    payload: Record<string, unknown>;
  }): Promise<{ eventId: string; duplicate: boolean; matchedSubscriptions: number }> {
    return this.request('/v1/events', this.settings.producerToken, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateSubscription(id: string, patch: { maxAttempts?: number }): Promise<Subscription> {
    return this.request(`/v1/subscriptions/${id}`, this.settings.adminToken, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  replay(deliveryId: string, reason: string): Promise<unknown> {
    return this.request(`/v1/deliveries/${deliveryId}/replay`, this.settings.adminToken, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // --- Consumer-side operations (use the consumer token) ---

  lease(
    subscriptionId: string,
    wait: number,
    visibilityTimeout?: number,
  ): Promise<{
    items: LeasedItem[];
    nextPollAfterMs: number;
  }> {
    const q = new URLSearchParams({ subscriptionId, limit: '10', wait: String(wait) });
    if (visibilityTimeout) q.set('visibilityTimeout', String(visibilityTimeout));
    return this.request(`/v1/inbox?${q.toString()}`, this.settings.consumerToken);
  }

  ack(deliveryId: string, leaseToken: string, processId: string): Promise<unknown> {
    return this.request(`/v1/deliveries/${deliveryId}/ack`, this.settings.consumerToken, {
      method: 'POST',
      headers: { 'X-Consumer-Process-ID': processId },
      body: JSON.stringify({ leaseToken }),
    });
  }

  nack(deliveryId: string, leaseToken: string, reason: string): Promise<unknown> {
    return this.request(`/v1/deliveries/${deliveryId}/nack`, this.settings.consumerToken, {
      method: 'POST',
      body: JSON.stringify({ leaseToken, reason }),
    });
  }
}
