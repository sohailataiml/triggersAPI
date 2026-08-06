import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { EventFocusCard } from './EventFocusCard';
import { renderWithProviders } from '../../test/utils';
import { useEventStore, type ActivityRecord } from '../../store/eventStore';
import type { DeliveryListItem, Subscription } from '../../types';

function ingestFrame(): ActivityRecord {
  return {
    id: 'f-0',
    type: 'event.ingested',
    eventId: 'evt-1',
    timestamp: new Date().toISOString(),
    workspaceId: 'ws',
    summary: { source: 'github', eventType: 'pull_request.opened' },
    receivedAt: Date.now(),
  };
}

const DELIVERY: DeliveryListItem = {
  id: 'dlv-1',
  eventId: 'evt-1',
  subscriptionId: 'sub-1',
  status: 'PENDING',
  attemptCount: 0,
  availableAt: new Date().toISOString(),
  leaseUntil: null,
  acknowledgedAt: null,
  deadLetteredAt: null,
  lastErrorCode: null,
  replayCount: 0,
  createdAt: new Date().toISOString(),
  event: { source: 'github', eventType: 'pull_request.opened', subject: null },
};

const SUB: Subscription = {
  id: 'sub-1',
  name: 'GitHub PRs',
  filters: { source: 'github', eventType: 'pull_request.opened', subject: null },
  isActive: true,
  visibilityTimeoutSeconds: 30,
  maxAttempts: 5,
  createdAt: '',
  updatedAt: '',
};

describe('EventFocusCard', () => {
  beforeEach(() => {
    useEventStore.setState({ activities: [], seen: new Set(), revision: 0 });
    useEventStore.getState().pushActivity(ingestFrame());
  });

  it('shows the focused event and its pull-inbox delivery target', async () => {
    renderWithProviders(<EventFocusCard eventId="evt-1" />, {
      api: {
        deliveries: vi.fn().mockResolvedValue([DELIVERY]),
        subscriptions: vi.fn().mockResolvedValue([SUB]),
      },
    });

    expect(await screen.findByText('pull_request.opened')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Pull inbox → GitHub PRs/i)).toBeInTheDocument());
  });

  it('prompts to select when nothing is focused', () => {
    renderWithProviders(<EventFocusCard eventId={null} />, {
      api: {
        deliveries: vi.fn().mockResolvedValue([]),
        subscriptions: vi.fn().mockResolvedValue([]),
      },
    });
    expect(screen.getByText(/select an event/i)).toBeInTheDocument();
  });
});
