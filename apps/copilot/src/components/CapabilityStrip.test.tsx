import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CapabilityStrip } from './CapabilityStrip';
import type { Capabilities, TriggersRole } from '../types';

function capabilities(
  roles: Record<TriggersRole, boolean>,
  overrides: Partial<Capabilities['mcp']> = {},
): Capabilities {
  return {
    llm: { configured: true, model: 'claude-opus-5', effort: 'medium' },
    mcp: {
      connected: true,
      serverName: 'triggers',
      serverVersion: '0.1.0',
      roles,
      toolNames: ['get_overview', 'ingest_event'],
      resourceUris: ['triggers://overview'],
      error: null,
      ...overrides,
    },
    explorerUrl: 'http://localhost:5173',
    mcpServerUrl: 'http://localhost:3100/mcp',
    isDevelopment: true,
  };
}

const noop = vi.fn();

describe('CapabilityStrip', () => {
  it('reports a connected MCP session with the server identity', () => {
    render(
      <CapabilityStrip
        capabilities={capabilities({ producer: true, consumer: true, admin: true })}
        onReconnect={noop}
        reconnecting={false}
      />,
    );

    expect(screen.getByText('MCP connected')).toBeInTheDocument();
    expect(screen.getByText('triggers v0.1.0')).toBeInTheDocument();
  });

  it('shows every role as enabled when all credentials are present', () => {
    render(
      <CapabilityStrip
        capabilities={capabilities({ producer: true, consumer: true, admin: true })}
        onReconnect={noop}
        reconnecting={false}
      />,
    );

    for (const role of ['Producer', 'Consumer', 'Admin']) {
      expect(screen.getByText(role)).toBeInTheDocument();
      expect(screen.getByText(role)).not.toHaveClass('line-through');
    }
  });

  it('strikes through a role whose credential is missing', () => {
    render(
      <CapabilityStrip
        capabilities={capabilities({ producer: true, consumer: false, admin: false })}
        onReconnect={noop}
        reconnecting={false}
      />,
    );

    expect(screen.getByText('Consumer')).toHaveClass('line-through');
    expect(screen.getByText('Admin')).toHaveClass('line-through');
    expect(screen.getByText('Producer')).not.toHaveClass('line-through');
  });

  it('reports a disconnected session and surfaces the reason', () => {
    render(
      <CapabilityStrip
        capabilities={capabilities(
          { producer: false, consumer: false, admin: false },
          { connected: false, toolNames: [], error: 'Could not reach the Triggers API' },
        )}
        onReconnect={noop}
        reconnecting={false}
      />,
    );

    expect(screen.getByText('MCP disconnected')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Could not reach the Triggers API');
  });

  it('shows the model and effort in use', () => {
    render(
      <CapabilityStrip
        capabilities={capabilities({ producer: true, consumer: true, admin: true })}
        onReconnect={noop}
        reconnecting={false}
      />,
    );

    expect(screen.getByText('claude-opus-5 · effort medium')).toBeInTheDocument();
  });

  it('triggers a reconnect on demand', async () => {
    const user = userEvent.setup();
    const onReconnect = vi.fn();
    render(
      <CapabilityStrip
        capabilities={capabilities({ producer: true, consumer: true, admin: true })}
        onReconnect={onReconnect}
        reconnecting={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: /reconnect/i }));
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it('handles a null capability payload without crashing', () => {
    render(<CapabilityStrip capabilities={null} onReconnect={noop} reconnecting={false} />);
    expect(screen.getByText('MCP disconnected')).toBeInTheDocument();
  });
});
