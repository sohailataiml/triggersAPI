import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscriptionFormDrawer } from './SubscriptionFormDrawer';
import { renderWithProviders } from '../../test/utils';

describe('SubscriptionFormDrawer', () => {
  it('requires a name before creating', async () => {
    const createSubscription = vi.fn();
    renderWithProviders(<SubscriptionFormDrawer open subscription={null} onClose={vi.fn()} />, {
      api: { createSubscription },
    });
    await userEvent.click(screen.getByRole('button', { name: /create subscription/i }));
    expect(createSubscription).not.toHaveBeenCalled();
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it('creates a subscription with filters and limits', async () => {
    const createSubscription = vi.fn().mockResolvedValue({ id: 's1', name: 'Payments' });
    const onClose = vi.fn();
    renderWithProviders(<SubscriptionFormDrawer open subscription={null} onClose={onClose} />, {
      api: { createSubscription },
    });

    await userEvent.type(screen.getByPlaceholderText(/GitHub pull requests/i), 'Payments');
    const [sourceInput, typeInput] = screen.getAllByPlaceholderText('any');
    await userEvent.type(sourceInput, 'stripe');
    await userEvent.type(typeInput, 'payment_intent.succeeded');
    await userEvent.click(screen.getByRole('button', { name: /create subscription/i }));

    await waitFor(() => expect(createSubscription).toHaveBeenCalledTimes(1));
    expect(createSubscription).toHaveBeenCalledWith({
      name: 'Payments',
      filters: { source: 'stripe', eventType: 'payment_intent.succeeded' },
      visibilityTimeoutSeconds: 30,
      maxAttempts: 5,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('sends null filters when left blank (match everything)', async () => {
    const createSubscription = vi.fn().mockResolvedValue({ id: 's2', name: 'All' });
    renderWithProviders(<SubscriptionFormDrawer open subscription={null} onClose={vi.fn()} />, {
      api: { createSubscription },
    });
    await userEvent.type(screen.getByPlaceholderText(/GitHub pull requests/i), 'All');
    await userEvent.click(screen.getByRole('button', { name: /create subscription/i }));
    await waitFor(() => expect(createSubscription).toHaveBeenCalled());
    expect(createSubscription.mock.calls[0][0].filters).toEqual({ source: null, eventType: null });
  });
});
