import type {
  AgentEvent,
  Capabilities,
  ContextSnapshot,
  CopilotErrorShape,
  SessionContext,
} from '../types';

/**
 * Client for the Copilot backend. This is the browser's *only* server —
 * the model credential and the Triggers MCP tokens live behind it, so nothing
 * here reads or stores a secret.
 */

const BASE = '/copilot';

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: CopilotErrorShape } | null;
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function fetchCapabilities(): Promise<Capabilities> {
  return getJson<Capabilities>('/capabilities');
}

export function reconnectMcp(): Promise<{ mcp: Capabilities['mcp'] }> {
  return getJson<{ mcp: Capabilities['mcp'] }>('/reconnect', { method: 'POST' });
}

export function fetchContextSnapshot(context: SessionContext): Promise<ContextSnapshot> {
  const params = new URLSearchParams();
  if (context.selectedDeliveryId) params.set('deliveryId', context.selectedDeliveryId);
  if (context.selectedSubscriptionId) params.set('subscriptionId', context.selectedSubscriptionId);
  const qs = params.toString();
  return getJson<ContextSnapshot>(`/context${qs ? `?${qs}` : ''}`);
}

export interface StreamChatOptions {
  turns: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: SessionContext;
  confirmations: string[];
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}

/**
 * POST the conversation and consume the agent's SSE response.
 *
 * A plain `fetch` rather than `EventSource` because the request needs a body
 * and must be cancellable — `EventSource` supports neither.
 */
export async function streamChat(options: StreamChatOptions): Promise<void> {
  const response = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      turns: options.turns,
      context: options.context,
      confirmations: options.confirmations,
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: CopilotErrorShape } | null;
    options.onEvent({
      type: 'error',
      error: body?.error ?? {
        kind: 'internal',
        message: `The Copilot server rejected the request (${response.status}).`,
        retryable: true,
      },
    });
    options.onEvent({ type: 'done', stopReason: null });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) {
          try {
            options.onEvent(JSON.parse(data) as AgentEvent);
          } catch {
            // Ignore a malformed frame rather than killing the stream.
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
