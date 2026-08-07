/**
 * View models for the Copilot UI. The agent-event shapes mirror
 * `server/src/agent.ts` — kept as a standalone declaration so the browser
 * bundle never imports server code (and therefore never imports anything that
 * touches credentials).
 */

export type DeliveryStatus =
  'PENDING' | 'LEASED' | 'RETRY_SCHEDULED' | 'ACKNOWLEDGED' | 'DEAD_LETTER';

export type AgentStatus = 'idle' | 'thinking' | 'responding' | 'calling_tool';

export type CopilotErrorKind =
  | 'mcp_unavailable'
  | 'mcp_timeout'
  | 'tool_failed'
  | 'llm_unavailable'
  | 'llm_refusal'
  | 'not_configured'
  | 'cancelled'
  | 'internal';

export interface CopilotErrorShape {
  kind: CopilotErrorKind;
  message: string;
  retryable: boolean;
  detail?: string;
}

export interface SessionContext {
  selectedEventId: string | null;
  selectedDeliveryId: string | null;
  selectedSubscriptionId: string | null;
}

export type AgentEvent =
  | { type: 'status'; status: 'thinking' | 'responding' | 'calling_tool' }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown; mutating: boolean }
  | {
      type: 'tool_result';
      id: string;
      ok: boolean;
      durationMs: number;
      result: unknown;
      error?: string;
    }
  | {
      type: 'tool_confirmation_required';
      id: string;
      name: string;
      args: unknown;
      fingerprint: string;
    }
  | { type: 'context'; context: SessionContext }
  | { type: 'error'; error: CopilotErrorShape }
  | { type: 'done'; stopReason: string | null };

export type TriggersRole = 'producer' | 'consumer' | 'admin';

export interface McpCapabilities {
  connected: boolean;
  serverName: string | null;
  serverVersion: string | null;
  roles: Record<TriggersRole, boolean>;
  toolNames: string[];
  resourceUris: string[];
  error: string | null;
}

export interface Capabilities {
  llm: { configured: boolean; model: string; effort: string };
  mcp: McpCapabilities;
  explorerUrl: string;
  mcpServerUrl: string;
  isDevelopment: boolean;
}

/** One rendered item in the transcript. */
export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | {
      kind: 'tool';
      id: string;
      name: string;
      args: unknown;
      mutating: boolean;
      status: 'running' | 'succeeded' | 'failed';
      durationMs?: number;
      result?: unknown;
      error?: string;
    }
  | {
      kind: 'confirm';
      id: string;
      name: string;
      args: unknown;
      fingerprint: string;
      resolved: 'pending' | 'approved' | 'declined';
    }
  | { kind: 'error'; id: string; error: CopilotErrorShape };

export interface Overview {
  totalEvents: number;
  pending: number;
  activeLeases: number;
  retryScheduled: number;
  deadLetter: number;
  acknowledged: number;
}

export interface DeliveryDetail {
  id: string;
  eventId: string;
  subscriptionId: string;
  status: DeliveryStatus;
  attemptCount: number;
  availableAt: string;
  leasedAt: string | null;
  leaseUntil: string | null;
  consumerInstanceId: string | null;
  acknowledgedAt: string | null;
  deadLetteredAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  replayCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  name: string;
  filters: { source: string | null; eventType: string | null; subject: string | null };
  isActive: boolean;
  visibilityTimeoutSeconds: number;
  maxAttempts: number;
}

export interface ContextSnapshot {
  overview: Overview | null;
  delivery: DeliveryDetail | null;
  subscription: Subscription | null;
}

export type ActivityType =
  | 'event.ingested'
  | 'delivery.created'
  | 'delivery.leased'
  | 'delivery.acknowledged'
  | 'delivery.retry_scheduled'
  | 'delivery.dead_lettered'
  | 'delivery.replayed';

export interface Activity {
  type: ActivityType;
  timestamp: string;
  eventId?: string;
  deliveryId?: string;
  subscriptionId?: string;
  status?: string;
  summary?: Record<string, unknown>;
}
