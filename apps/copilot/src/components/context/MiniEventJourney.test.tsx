import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MiniEventJourney } from './MiniEventJourney';

describe('MiniEventJourney', () => {
  it('always renders the happy path', () => {
    render(<MiniEventJourney status="PENDING" attemptCount={1} replayCount={0} />);

    for (const stage of ['Ingested', 'Pending', 'Leased', 'Acknowledged']) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
  });

  it('shows no branches for a clean first-attempt delivery', () => {
    render(<MiniEventJourney status="PENDING" attemptCount={1} replayCount={0} />);

    expect(screen.queryByText(/Retried/)).not.toBeInTheDocument();
    expect(screen.queryByText('Dead letter')).not.toBeInTheDocument();
    expect(screen.queryByText(/Replayed/)).not.toBeInTheDocument();
  });

  it('shows the retry branch with the attempt number', () => {
    render(<MiniEventJourney status="RETRY_SCHEDULED" attemptCount={2} replayCount={0} />);
    expect(screen.getByText('Retried · attempt 2')).toBeInTheDocument();
  });

  it('shows the dead-letter branch', () => {
    render(<MiniEventJourney status="DEAD_LETTER" attemptCount={5} replayCount={0} />);
    expect(screen.getByText('Dead letter')).toBeInTheDocument();
  });

  it('shows the replay branch with a count', () => {
    render(<MiniEventJourney status="PENDING" attemptCount={5} replayCount={2} />);
    expect(screen.getByText('Replayed ×2')).toBeInTheDocument();
  });

  it('renders without a delivery selected', () => {
    render(<MiniEventJourney status={null} attemptCount={0} replayCount={0} />);
    expect(screen.getByText('Ingested')).toBeInTheDocument();
  });
});
