import { beforeEach, describe, expect, it } from 'vitest';
import { useCopilotStore } from './copilotStore';
import type { ChatItem } from '../types';

const store = () => useCopilotStore.getState();

describe('copilot store', () => {
  beforeEach(() => store().clear());

  it('accumulates streamed text into a single assistant message', () => {
    store().apply({ type: 'text_delta', text: 'One ' });
    store().apply({ type: 'text_delta', text: 'delivery ' });
    store().apply({ type: 'text_delta', text: 'is pending.' });

    const items = store().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'assistant',
      text: 'One delivery is pending.',
      streaming: true,
    });
  });

  it('settles the streaming flag when the turn finishes', () => {
    store().apply({ type: 'text_delta', text: 'Done.' });
    store().apply({ type: 'done', stopReason: 'end_turn' });

    expect(store().items[0]).toMatchObject({ streaming: false });
    expect(store().status).toBe('idle');
  });

  it('moves a tool card from running to succeeded in place', () => {
    store().apply({
      type: 'tool_call',
      id: 'tu_1',
      name: 'get_overview',
      args: {},
      mutating: false,
    });
    expect(store().items[0]).toMatchObject({ kind: 'tool', status: 'running' });

    store().apply({
      type: 'tool_result',
      id: 'tu_1',
      ok: true,
      durationMs: 42,
      result: { totalEvents: 3 },
    });

    expect(store().items).toHaveLength(1);
    expect(store().items[0]).toMatchObject({
      kind: 'tool',
      status: 'succeeded',
      durationMs: 42,
      result: { totalEvents: 3 },
    });
  });

  it('marks a failed tool call and keeps its error', () => {
    store().apply({
      type: 'tool_call',
      id: 'tu_1',
      name: 'ack_delivery',
      args: {},
      mutating: true,
    });
    store().apply({
      type: 'tool_result',
      id: 'tu_1',
      ok: false,
      durationMs: 9,
      result: null,
      error: 'LEASE_EXPIRED',
    });

    expect(store().items[0]).toMatchObject({ status: 'failed', error: 'LEASE_EXPIRED' });
  });

  it('stops streaming the assistant bubble when a tool call interrupts it', () => {
    store().apply({ type: 'text_delta', text: 'Let me check.' });
    store().apply({
      type: 'tool_call',
      id: 'tu_1',
      name: 'get_overview',
      args: {},
      mutating: false,
    });

    expect(store().items[0]).toMatchObject({ kind: 'assistant', streaming: false });
    expect(store().items[1]).toMatchObject({ kind: 'tool' });
  });

  it('tracks the selected delivery from a context event', () => {
    store().apply({
      type: 'context',
      context: {
        selectedEventId: 'e-1',
        selectedDeliveryId: 'd-1',
        selectedSubscriptionId: null,
      },
    });

    expect(store().context.selectedDeliveryId).toBe('d-1');
  });

  it('records an approved confirmation exactly once', () => {
    store().apply({
      type: 'tool_confirmation_required',
      id: 'tu_1',
      name: 'delete_subscription',
      args: { subscriptionId: 's-1' },
      fingerprint: 'fp-1',
    });

    expect(store().approveConfirmation('tu_1')).toBe('fp-1');
    expect(store().approveConfirmation('tu_1')).toBe('fp-1');
    expect(store().confirmations).toEqual(['fp-1']);
    expect(store().items[0]).toMatchObject({ resolved: 'approved' });
  });

  it('marks a declined confirmation without granting it', () => {
    store().apply({
      type: 'tool_confirmation_required',
      id: 'tu_1',
      name: 'reset_workspace',
      args: {},
      fingerprint: 'fp-2',
    });
    store().declineConfirmation('tu_1');

    expect(store().confirmations).toEqual([]);
    expect(store().items[0]).toMatchObject({ resolved: 'declined' });
  });

  it('builds history from text turns only, excluding tool cards', () => {
    store().appendUser('check the inbox');
    store().apply({
      type: 'tool_call',
      id: 'tu_1',
      name: 'lease_deliveries',
      args: {},
      mutating: true,
    });
    store().apply({ type: 'tool_result', id: 'tu_1', ok: true, durationMs: 5, result: {} });
    store().apply({ type: 'text_delta', text: 'Leased one delivery.' });
    store().apply({ type: 'done', stopReason: 'end_turn' });

    expect(store().turns()).toEqual([
      { role: 'user', content: 'check the inbox' },
      { role: 'assistant', content: 'Leased one delivery.' },
    ]);
  });

  it('resets everything on clear, including approved confirmations', () => {
    store().appendUser('hi');
    store().apply({
      type: 'tool_confirmation_required',
      id: 'tu_1',
      name: 'delete_subscription',
      args: {},
      fingerprint: 'fp-1',
    });
    store().approveConfirmation('tu_1');
    store().clear();

    expect(store().items).toEqual([] as ChatItem[]);
    expect(store().confirmations).toEqual([]);
    expect(store().lastPrompt).toBeNull();
    expect(store().context.selectedDeliveryId).toBeNull();
  });
});
