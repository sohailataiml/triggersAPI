import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeliveryAttemptTimeline } from './DeliveryAttemptTimeline';
import { useEventStore, type ActivityRecord } from '../../store/eventStore';
import type { ActivityType, DeliveryListItem } from '../../types';

let seq = 0;
function frame(type: ActivityType, summary?: Record<string, unknown>): ActivityRecord {
  return {
    id: `f-${seq++}`,
    type,
    eventId: 'evt-1',
    deliveryId: type === 'event.ingested' ? undefined : 'dlv-1',
    subscriptionId: 'sub-1',
    timestamp: new Date(Date.now() + seq * 1000).toISOString(),
    workspaceId: 'ws',
    summary,
    receivedAt: Date.now() + seq,
  };
}

const SNAPSHOT: Pick<
  DeliveryListItem,
  | 'status'
  | 'attemptCount'
  | 'leaseUntil'
  | 'availableAt'
  | 'deadLetteredAt'
  | 'acknowledgedAt'
  | 'lastErrorCode'
> = {
  status: 'ACKNOWLEDGED',
  attemptCount: 1,
  leaseUntil: null,
  availableAt: new Date().toISOString(),
  deadLetteredAt: null,
  acknowledgedAt: new Date().toISOString(),
  lastErrorCode: null,
};

describe('DeliveryAttemptTimeline', () => {
  beforeEach(() => {
    seq = 0;
    useEventStore.setState({ activities: [], seen: new Set(), revision: 0 });
  });

  it('reconstructs lease → ack attempts from SSE frames', () => {
    const store = useEventStore.getState();
    store.pushActivity(
      frame('event.ingested', { source: 'github', eventType: 'pull_request.opened' }),
    );
    store.pushActivity(frame('delivery.leased', { attempt: 1 }));
    store.pushActivity(frame('delivery.acknowledged'));

    render(<DeliveryAttemptTimeline deliveryId="dlv-1" eventId="evt-1" snapshot={SNAPSHOT} />);

    expect(screen.getByText(/Attempt 1 — leased/i)).toBeInTheDocument();
    expect(screen.getByText(/Acknowledged/i)).toBeInTheDocument();
  });

  it('shows a retry failure reason and next-retry tail from the snapshot', () => {
    const store = useEventStore.getState();
    store.pushActivity(frame('delivery.leased', { attempt: 1 }));
    store.pushActivity(
      frame('delivery.retry_scheduled', { attempt: 1, reason: 'processing_failed' }),
    );

    render(
      <DeliveryAttemptTimeline
        deliveryId="dlv-1"
        eventId="evt-1"
        snapshot={{
          ...SNAPSHOT,
          status: 'RETRY_SCHEDULED',
          availableAt: new Date(Date.now() + 15000).toISOString(),
        }}
      />,
    );

    expect(screen.getByText(/Attempt 1 failed/i)).toBeInTheDocument();
    expect(screen.getByText(/processing failed/i)).toBeInTheDocument();
    // Exact match targets the snapshot tail label (the frame sub-line also
    // contains "retry scheduled", so a loose regex would match twice).
    expect(screen.getByText('Retry scheduled')).toBeInTheDocument();
    expect(screen.getByText(/next attempt/i)).toBeInTheDocument();
  });
});
