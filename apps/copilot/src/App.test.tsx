import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { useCopilotStore } from './store/copilotStore';
import type { Capabilities } from './types';

function capabilities(overrides: Partial<Capabilities> = {}): Capabilities {
  return {
    llm: { configured: true, model: 'claude-opus-5', effort: 'medium' },
    mcp: {
      connected: true,
      serverName: 'triggers',
      serverVersion: '0.1.0',
      roles: { producer: true, consumer: true, admin: true },
      toolNames: ['get_overview', 'ingest_event', 'lease_deliveries', 'ack_delivery'],
      resourceUris: ['triggers://overview'],
      error: null,
    },
    explorerUrl: 'http://localhost:5173',
    mcpServerUrl: 'http://localhost:3100/mcp',
    isDevelopment: true,
    ...overrides,
  };
}

/** Route the two GETs the app makes on mount. */
function stubFetch(caps: Capabilities | null) {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/copilot/capabilities')) {
      return caps
        ? Promise.resolve(new Response(JSON.stringify(caps), { status: 200 }))
        : Promise.resolve(new Response('{}', { status: 503 }));
    }
    if (url.includes('/copilot/context')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            overview: {
              totalEvents: 3,
              pending: 1,
              activeLeases: 0,
              retryScheduled: 0,
              deadLetter: 0,
              acknowledged: 2,
            },
            delivery: null,
            subscription: null,
          }),
          { status: 200 },
        ),
      );
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  useCopilotStore.getState().clear();
});

describe('App', () => {
  it('renders the product identity and challenge disclaimer', async () => {
    vi.stubGlobal('fetch', stubFetch(capabilities()));
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Zapier AI Automation Copilot',
    );
    expect(screen.getByText(/Not an official Zapier product/)).toBeInTheDocument();
    expect(
      screen.getByText('Agentic event operations powered by TriggersAPI + MCP'),
    ).toBeInTheDocument();
  });

  it('renders the chat and live-context split once connected', async () => {
    vi.stubGlobal('fetch', stubFetch(capabilities()));
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('Copilot conversation')).toBeInTheDocument());
    expect(screen.getByLabelText('Live context')).toBeInTheDocument();
    expect(screen.getByLabelText('Message the Copilot')).toBeInTheDocument();
  });

  it('shows a setup screen instead of a chat box when no model key is configured', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch(
        capabilities({ llm: { configured: false, model: 'claude-opus-5', effort: 'medium' } }),
      ),
    );
    render(<App />);

    // No retry can create an environment variable, so this surfaces at once
    // rather than sitting in the connecting state.
    await waitFor(() => expect(screen.getByText('Add a model credential')).toBeInTheDocument());
    // Named in both the step heading and its example line.
    expect(screen.getAllByText(/ANTHROPIC_API_KEY/).length).toBeGreaterThan(0);
    // Critically, it must not present a chat box that would fail on first use.
    expect(screen.queryByLabelText('Message the Copilot')).not.toBeInTheDocument();
  });

  const disconnected = () =>
    capabilities({
      mcp: {
        connected: false,
        serverName: null,
        serverVersion: null,
        roles: { producer: false, consumer: false, admin: false },
        toolNames: [],
        resourceUris: [],
        error: 'Could not reach the Triggers MCP server.',
      },
    });

  it('keeps retrying while MCP is still starting, instead of stranding the viewer', async () => {
    // A demo starts every process at once, so the first capability check often
    // lands before the MCP server is listening. That must not look like an error.
    const fetchMock = stubFetch(disconnected());
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Connecting to the Triggers MCP server/)).toBeInTheDocument(),
    );

    const capabilityCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/copilot/capabilities')).length;
    await waitFor(() => expect(capabilityCalls()).toBeGreaterThan(1), { timeout: 4000 });
  });

  it('recovers on its own once MCP comes up, with no reload', async () => {
    let connected = false;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/copilot/capabilities')) {
          const body = connected ? capabilities() : disconnected();
          connected = true; // MCP finishes starting between the two attempts.
          return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Connecting to the Triggers MCP server/)).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByLabelText('Copilot conversation')).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(screen.getByText('MCP connected')).toBeInTheDocument();
  });

  it('states that credentials never reach the browser', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch(
        capabilities({ llm: { configured: false, model: 'claude-opus-5', effort: 'medium' } }),
      ),
    );
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/Nothing is stored\s+in the browser/)).toBeInTheDocument(),
    );
  });

  it('offers an Explorer deep link', async () => {
    vi.stubGlobal('fetch', stubFetch(capabilities()));
    render(<App />);

    await waitFor(() => {
      const link = screen.getAllByRole('link', { name: /explorer/i })[0];
      expect(link).toHaveAttribute('href', 'http://localhost:5173');
    });
  });

  it('hides configuration chrome in presentation mode', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', stubFetch(capabilities()));
    render(<App />);

    await waitFor(() => expect(screen.getByText('MCP connected')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /present/i }));

    expect(screen.queryByText('MCP connected')).not.toBeInTheDocument();
    // The conversation itself must stay front and centre.
    expect(screen.getByLabelText('Copilot conversation')).toBeInTheDocument();
  });

  it('opens the command palette on Ctrl+K', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', stubFetch(capabilities()));
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('Copilot conversation')).toBeInTheDocument());
    await user.keyboard('{Control>}k{/Control}');

    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByText('Show system overview')).toBeInTheDocument();
  });

  it('stores no credential in browser storage', async () => {
    vi.stubGlobal('fetch', stubFetch(capabilities()));
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('Copilot conversation')).toBeInTheDocument());

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('renders no token anywhere in the DOM', async () => {
    vi.stubGlobal('fetch', stubFetch(capabilities()));
    const { container } = render(<App />);

    await waitFor(() => expect(screen.getByLabelText('Copilot conversation')).toBeInTheDocument());

    expect(container.innerHTML).not.toMatch(/trg_[a-z0-9]{6,}/);
    expect(container.innerHTML).not.toMatch(/sk-ant-/);
  });
});
