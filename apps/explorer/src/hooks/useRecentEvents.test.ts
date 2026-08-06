import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEventStore, type ActivityRecord } from '../store/eventStore';
import { useRecentEvents } from './useRecentEvents';
import type { ActivityType } from '../types';

let seq = 0;
function push(type: ActivityType, eventId: string, summary?: Record<string, unknown>) {
  const record: ActivityRecord = {
    id: `id-${seq++}`,
    type,
    eventId,
    deliveryId: type === 'event.ingested' ? undefined : `dlv-${eventId}`,
    subscriptionId: 'sub-1',
    timestamp: new Date(Date.now() + seq * 10).toISOString(),
    workspaceId: 'ws',
    summary,
    receivedAt: Date.now() + seq,
  };
  useEventStore.getState().pushActivity(record);
}

describe('useRecentEvents projection', () => {
  beforeEach(() => {
    seq = 0;
    useEventStore.setState({ activities: [], seen: new Set(), revision: 0 });
  });

  it('advances an event through the pipeline as frames arrive', () => {
    push('event.ingested', 'evt-1', { source: 'github', eventType: 'pull_request.opened' });
    push('delivery.created', 'evt-1');
    push('delivery.leased', 'evt-1', { attempt: 1 });
    push('delivery.acknowledged', 'evt-1');

    const { result } = renderHook(() => useRecentEvents());
    const token = result.current.find((t) => t.eventId === 'evt-1');
    expect(token).toBeDefined();
    expect(token!.source).toBe('github');
    expect(token!.currentIndex).toBe(6); // acknowledged
    expect(token!.reachedIndex).toBe(6);
    expect(token!.branch).toBeNull();
  });

  it('flags dead-lettered events with the dead branch', () => {
    push('event.ingested', 'evt-2', { source: 'stripe', eventType: 'payment.failed' });
    push('delivery.created', 'evt-2');
    push('delivery.dead_lettered', 'evt-2', { attempt: 1, reason: 'timeout' });

    const { result } = renderHook(() => useRecentEvents());
    const token = result.current.find((t) => t.eventId === 'evt-2');
    expect(token!.branch).toBe('dead');
  });
});
