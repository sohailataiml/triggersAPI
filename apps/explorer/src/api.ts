import type { DeliveryDetail, DeliveryListItem, Overview, Settings, Subscription } from './types';

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
  }): Promise<unknown> {
    return this.request('/v1/events', this.settings.producerToken, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  replay(deliveryId: string, reason: string): Promise<unknown> {
    return this.request(`/v1/deliveries/${deliveryId}/replay`, this.settings.adminToken, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }
}
