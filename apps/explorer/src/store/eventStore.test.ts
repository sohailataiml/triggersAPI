import { beforeEach, describe, expect, it } from 'vitest';
import { useEventStore, type ActivityRecord } from './eventStore';

function rec(id: string, eventId = 'evt-1'): ActivityRecord {
  return {
    id,
    eventId,
    type: 'event.ingested',
    timestamp: new Date().toISOString(),
    workspaceId: 'ws',
    receivedAt: Date.now(),
  };
}

describe('eventStore', () => {
  beforeEach(() => {
    useEventStore.setState({ activities: [], seen: new Set(), revision: 0 });
  });

  it('dedupes activities by stream id', () => {
    const s = useEventStore.getState();
    expect(s.pushActivity(rec('a'))).toBe(true);
    expect(useEventStore.getState().pushActivity(rec('a'))).toBe(false); // duplicate id
    expect(useEventStore.getState().activities).toHaveLength(1);
  });

  it('bumps revision only on fresh activity', () => {
    useEventStore.getState().pushActivity(rec('a'));
    const r1 = useEventStore.getState().revision;
    useEventStore.getState().pushActivity(rec('a')); // dup
    expect(useEventStore.getState().revision).toBe(r1);
    useEventStore.getState().pushActivity(rec('b'));
    expect(useEventStore.getState().revision).toBe(r1 + 1);
  });

  it('prepends newest first', () => {
    useEventStore.getState().pushActivity(rec('a'));
    useEventStore.getState().pushActivity(rec('b'));
    expect(useEventStore.getState().activities[0].id).toBe('b');
  });
});
