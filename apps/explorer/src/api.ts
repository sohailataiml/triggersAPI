import type {
  DeliveryDetail,
  DeliveryListItem,
  EventListItem,
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
        // Only advertise a JSON body when we actually send one. Fastify rejects
        // an empty body when Content-Type is application/json, which broke
        // body-less calls like reset (POST) and delete (DELETE).
        ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    const contentType = res.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const body = isJson ? await res.json().catch(() => ({})) : null;
    if (!res.ok) {
      const message = body?.error?.message ?? `Request failed (${res.status})`;
      throw new Error(message);
    }
    // A non-JSON 200 means the request never reached the API — typically a wrong
    // "API base" so a static host returned its SPA index.html. Fail loudly
    // instead of silently treating it as empty data.
    if (!isJson) {
      throw new Error(
        `Expected JSON from ${path} but received ${contentType || 'a non-JSON response'}. ` +
          'Check that "API base" in Settings points to the API, not the web app.',
      );
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
    filters: { source?: string | null; eventType?: string | null; subject?: string | null };
    visibilityTimeoutSeconds?: number;
    maxAttempts?: number;
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

  ingest(
    input: {
      source: string;
      eventType: string;
      subject?: string;
      payload: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      occurredAt?: string;
    },
    idempotencyKey?: string,
  ): Promise<{ eventId: string; duplicate: boolean; matchedSubscriptions: number }> {
    return this.request('/v1/events', this.settings.producerToken, {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify(input),
    });
  }

  events(params: {
    source?: string;
    eventType?: string;
    status?: string;
    search?: string;
  }): Promise<EventListItem[]> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const qs = q.toString();
    return this.request(`/v1/events${qs ? `?${qs}` : ''}`, this.settings.adminToken);
  }

  updateSubscription(
    id: string,
    patch: {
      name?: string;
      filters?: { source?: string | null; eventType?: string | null; subject?: string | null };
      visibilityTimeoutSeconds?: number;
      maxAttempts?: number;
      isActive?: boolean;
    },
  ): Promise<Subscription> {
    return this.request(`/v1/subscriptions/${id}`, this.settings.adminToken, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  /** Demo-safe reset: clears events/deliveries for the workspace (keeps keys). */
  reset(): Promise<{ eventsDeleted: number }> {
    return this.request('/v1/explorer/reset', this.settings.adminToken, { method: 'POST' });
  }

  deleteSubscription(id: string): Promise<{ deleted: true }> {
    return this.request(`/v1/subscriptions/${id}`, this.settings.adminToken, { method: 'DELETE' });
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
