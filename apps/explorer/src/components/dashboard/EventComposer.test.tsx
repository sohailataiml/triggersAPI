import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventComposer } from './EventComposer';
import { renderWithProviders } from '../../test/utils';

describe('EventComposer', () => {
  it('blocks submit and shows an inline error on invalid JSON', async () => {
    const ingest = vi.fn();
    renderWithProviders(<EventComposer onIngested={vi.fn()} />, { api: { ingest } });

    const payload = screen.getByLabelText(/payload/i);
    await userEvent.clear(payload);
    await userEvent.type(payload, '{{ not json');

    await userEvent.click(screen.getByRole('button', { name: /send event/i }));

    expect(ingest).not.toHaveBeenCalled();
    expect(screen.getByText(/payload:/i)).toBeInTheDocument();
  });

  it('ingests valid JSON and shows the accepted event id', async () => {
    const ingest = vi.fn().mockResolvedValue({
      eventId: '019fd7ba-aaaa-bbbb-cccc-ddddeeeeffff',
      duplicate: false,
      matchedSubscriptions: 1,
    });
    const onIngested = vi.fn();
    renderWithProviders(<EventComposer onIngested={onIngested} />, { api: { ingest } });

    await userEvent.click(screen.getByRole('button', { name: /send event/i }));

    await waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    expect(onIngested).toHaveBeenCalled();
    expect(await screen.findByText(/accepted/i)).toBeInTheDocument();
    expect(screen.getByText('019fd7ba')).toBeInTheDocument();
  });

  it('applying a preset swaps source and event type', async () => {
    renderWithProviders(<EventComposer onIngested={vi.fn()} />, { api: { ingest: vi.fn() } });
    await userEvent.click(screen.getByRole('button', { name: /Stripe payment succeeded/i }));
    expect((screen.getByLabelText(/event type/i) as HTMLInputElement).value).toBe(
      'payment_intent.succeeded',
    );
  });
});
