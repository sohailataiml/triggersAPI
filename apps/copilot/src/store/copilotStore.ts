import { create } from 'zustand';
import type {
  AgentEvent,
  AgentStatus,
  ChatItem,
  CopilotErrorShape,
  SessionContext,
} from '../types';

/**
 * Conversation and agent-execution state.
 *
 * Deliberately holds no authoritative platform state — delivery status, counts,
 * and lifecycle come from the live context snapshot, which is fetched from the
 * server. Mixing them would let a stale chat transcript contradict the database.
 */

const emptyContext = (): SessionContext => ({
  selectedEventId: null,
  selectedDeliveryId: null,
  selectedSubscriptionId: null,
});

let sequence = 0;
const nextId = (prefix: string): string => `${prefix}-${(sequence += 1)}`;

interface CopilotState {
  items: ChatItem[];
  status: AgentStatus;
  context: SessionContext;
  /** Fingerprints the user has approved this session. */
  confirmations: string[];
  /** Last user prompt, so a failed turn can be retried verbatim. */
  lastPrompt: string | null;

  appendUser: (text: string) => void;
  apply: (event: AgentEvent) => void;
  setStatus: (status: AgentStatus) => void;
  pushError: (error: CopilotErrorShape) => void;
  approveConfirmation: (id: string) => string | null;
  declineConfirmation: (id: string) => void;
  clear: () => void;
  /** Conversation history in the shape the agent expects. */
  turns: () => Array<{ role: 'user' | 'assistant'; content: string }>;
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  items: [],
  status: 'idle',
  context: emptyContext(),
  confirmations: [],
  lastPrompt: null,

  appendUser: (text) =>
    set((state) => ({
      items: [...state.items, { kind: 'user', id: nextId('user'), text }],
      lastPrompt: text,
    })),

  apply: (event) =>
    set((state) => {
      switch (event.type) {
        case 'status':
          return { status: event.status };

        case 'text_delta': {
          const last = state.items.at(-1);
          if (last?.kind === 'assistant' && last.streaming) {
            const items = state.items.slice(0, -1);
            items.push({ ...last, text: last.text + event.text });
            return { items };
          }
          return {
            items: [
              ...state.items,
              { kind: 'assistant', id: nextId('assistant'), text: event.text, streaming: true },
            ],
          };
        }

        case 'tool_call':
          return {
            items: [
              ...state.items.map((item) =>
                item.kind === 'assistant' && item.streaming ? { ...item, streaming: false } : item,
              ),
              {
                kind: 'tool',
                id: event.id,
                name: event.name,
                args: event.args,
                mutating: event.mutating,
                status: 'running',
              },
            ],
          };

        case 'tool_result':
          return {
            items: state.items.map((item) =>
              item.kind === 'tool' && item.id === event.id
                ? {
                    ...item,
                    status: event.ok ? 'succeeded' : 'failed',
                    durationMs: event.durationMs,
                    result: event.result,
                    error: event.error,
                  }
                : item,
            ),
          };

        case 'tool_confirmation_required':
          return {
            items: [
              ...state.items,
              {
                kind: 'confirm',
                id: event.id,
                name: event.name,
                args: event.args,
                fingerprint: event.fingerprint,
                resolved: 'pending',
              },
            ],
          };

        case 'context':
          return { context: event.context };

        case 'error':
          return {
            items: [
              ...state.items.map((item) =>
                item.kind === 'assistant' && item.streaming ? { ...item, streaming: false } : item,
              ),
              { kind: 'error', id: nextId('error'), error: event.error },
            ],
          };

        case 'done':
          return {
            status: 'idle',
            items: state.items.map((item) =>
              item.kind === 'assistant' && item.streaming ? { ...item, streaming: false } : item,
            ),
          };

        default:
          return {};
      }
    }),

  setStatus: (status) => set({ status }),

  pushError: (error) =>
    set((state) => ({
      status: 'idle',
      items: [...state.items, { kind: 'error', id: nextId('error'), error }],
    })),

  approveConfirmation: (id) => {
    const item = get().items.find((entry) => entry.kind === 'confirm' && entry.id === id);
    if (!item || item.kind !== 'confirm') return null;
    set((state) => ({
      confirmations: state.confirmations.includes(item.fingerprint)
        ? state.confirmations
        : [...state.confirmations, item.fingerprint],
      items: state.items.map((entry) =>
        entry.kind === 'confirm' && entry.id === id ? { ...entry, resolved: 'approved' } : entry,
      ),
    }));
    return item.fingerprint;
  },

  declineConfirmation: (id) =>
    set((state) => ({
      items: state.items.map((entry) =>
        entry.kind === 'confirm' && entry.id === id ? { ...entry, resolved: 'declined' } : entry,
      ),
    })),

  clear: () =>
    set({
      items: [],
      status: 'idle',
      context: emptyContext(),
      confirmations: [],
      lastPrompt: null,
    }),

  turns: () =>
    get()
      .items.filter(
        (item): item is Extract<ChatItem, { kind: 'user' | 'assistant' }> =>
          (item.kind === 'user' || item.kind === 'assistant') && item.text.trim().length > 0,
      )
      .map((item) => ({ role: item.kind, content: item.text })),
}));
