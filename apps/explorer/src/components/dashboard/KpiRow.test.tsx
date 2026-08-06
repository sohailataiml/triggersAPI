import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { KpiRow } from './KpiRow';
import { renderWithProviders } from '../../test/utils';

describe('KpiRow', () => {
  it('renders live overview values and a derived success rate', async () => {
    const overview = vi.fn().mockResolvedValue({
      totalEvents: 10,
      pending: 2,
      activeLeases: 1,
      retryScheduled: 0,
      deadLetter: 1,
      acknowledged: 3,
    });
    renderWithProviders(<KpiRow />, { api: { overview } });

    await waitFor(() => expect(overview).toHaveBeenCalled());
    // total events
    expect(await screen.findByText('10')).toBeInTheDocument();
    // success rate = 3 / (3 + 1) = 75%
    expect(await screen.findByText('75%')).toBeInTheDocument();
  });

  it('shows an unavailable success rate when there are no terminal deliveries', async () => {
    const overview = vi.fn().mockResolvedValue({
      totalEvents: 0,
      pending: 0,
      activeLeases: 0,
      retryScheduled: 0,
      deadLetter: 0,
      acknowledged: 0,
    });
    renderWithProviders(<KpiRow />, { api: { overview } });
    await waitFor(() => expect(overview).toHaveBeenCalled());
    expect(await screen.findByText(/no terminal deliveries/i)).toBeInTheDocument();
  });
});
