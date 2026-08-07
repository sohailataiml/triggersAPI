import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolCallCard } from './ToolCallCard';
import type { ChatItem } from '../../types';

type ToolItem = Extract<ChatItem, { kind: 'tool' }>;

const base: ToolItem = {
  kind: 'tool',
  id: 'tu_1',
  name: 'ingest_event',
  args: { source: 'github', eventType: 'pull_request.opened' },
  mutating: true,
  status: 'running',
};

describe('ToolCallCard', () => {
  it('shows the tool name and a running state', () => {
    render(<ToolCallCard item={base} />);

    expect(screen.getByText('ingest_event')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('flags a state-changing tool', () => {
    render(<ToolCallCard item={base} />);
    expect(screen.getByText('changes state')).toBeInTheDocument();
  });

  it('does not flag a read-only tool', () => {
    render(<ToolCallCard item={{ ...base, name: 'get_overview', mutating: false }} />);
    expect(screen.queryByText('changes state')).not.toBeInTheDocument();
  });

  it('shows success with the call duration', () => {
    render(
      <ToolCallCard
        item={{ ...base, status: 'succeeded', durationMs: 1250, result: { eventId: 'evt-1' } }}
      />,
    );

    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    expect(screen.getByText('1.3s')).toBeInTheDocument();
  });

  it('is collapsed by default and expands to reveal arguments and result', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallCard
        item={{ ...base, status: 'succeeded', durationMs: 12, result: { eventId: 'evt-1' } }}
      />,
    );

    expect(screen.queryByText('Arguments')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('Arguments')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText(/pull_request\.opened/)).toBeInTheDocument();
  });

  it('renders a failure with its error instead of a result', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallCard
        item={{
          ...base,
          name: 'ack_delivery',
          status: 'failed',
          durationMs: 30,
          error: 'LEASE_EXPIRED (HTTP 409): The delivery lease has expired.',
        }}
      />,
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(/LEASE_EXPIRED/)).toBeInTheDocument();
  });

  it('renders masked arguments verbatim — it never receives a real secret', async () => {
    const user = userEvent.setup();
    render(
      <ToolCallCard
        item={{
          ...base,
          name: 'ack_delivery',
          args: { deliveryId: 'd-1', leaseToken: 'leas••••89' },
          status: 'succeeded',
          durationMs: 10,
          result: {},
        }}
      />,
    );

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText(/leas••••89/)).toBeInTheDocument();
    expect(screen.queryByText(/lease_[a-z0-9]{8,}/)).not.toBeInTheDocument();
  });
});
