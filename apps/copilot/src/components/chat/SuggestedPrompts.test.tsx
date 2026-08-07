import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuggestedPrompts } from './SuggestedPrompts';
import type { Capabilities } from '../../types';

function capabilities(toolNames: string[]): Capabilities {
  return {
    llm: { configured: true, model: 'claude-opus-5', effort: 'medium' },
    mcp: {
      connected: true,
      serverName: 'triggers',
      serverVersion: '0.1.0',
      roles: { producer: true, consumer: true, admin: true },
      toolNames,
      resourceUris: [],
      error: null,
    },
    explorerUrl: 'http://localhost:5173',
    mcpServerUrl: 'http://localhost:3100/mcp',
    isDevelopment: true,
  };
}

describe('SuggestedPrompts', () => {
  it('offers only suggestions whose tool is registered', () => {
    render(
      <SuggestedPrompts
        capabilities={capabilities(['ingest_event'])}
        onPick={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByText('Send a sample GitHub event')).toBeInTheDocument();
    // No consumer or admin tools configured, so these must not be advertised.
    expect(screen.queryByText('Acknowledge the delivery')).not.toBeInTheDocument();
    expect(screen.queryByText('Replay the failed delivery')).not.toBeInTheDocument();
  });

  it('offers the full set when every tool is available', () => {
    render(
      <SuggestedPrompts
        capabilities={capabilities([
          'create_subscription',
          'ingest_event',
          'list_deliveries',
          'lease_deliveries',
          'ack_delivery',
          'nack_delivery',
          'replay_delivery',
          'get_overview',
        ])}
        onPick={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByText('Replay the failed delivery')).toBeInTheDocument();
    expect(screen.getByText('System overview')).toBeInTheDocument();
  });

  it('renders nothing when no tools are available', () => {
    const { container } = render(
      <SuggestedPrompts capabilities={capabilities([])} onPick={vi.fn()} disabled={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('sends the full prompt, not the short label', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <SuggestedPrompts
        capabilities={capabilities(['get_overview'])}
        onPick={onPick}
        disabled={false}
      />,
    );

    await user.click(screen.getByText('System overview'));

    expect(onPick).toHaveBeenCalledWith("What's going on in the system?");
  });

  it('disables suggestions while the agent is busy', () => {
    render(
      <SuggestedPrompts capabilities={capabilities(['get_overview'])} onPick={vi.fn()} disabled />,
    );

    expect(screen.getByText('System overview')).toBeDisabled();
  });
});
