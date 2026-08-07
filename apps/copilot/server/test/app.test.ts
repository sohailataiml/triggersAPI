// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type CopilotApp } from '../src/app.js';
import type { AgentEvent } from '../src/agent.js';
import {
  silentLogger,
  stubAnthropic,
  stubMcpClient,
  testConfig,
  type StubMcp,
} from './helpers/stubs.js';
import type { CopilotConfig } from '../src/config.js';
import type Anthropic from '@anthropic-ai/sdk';

const running: CopilotApp[] = [];

interface Started {
  url: string;
  mcp: StubMcp;
}

async function start(
  config: Partial<CopilotConfig> = {},
  anthropic?: Anthropic,
  mcp: StubMcp = stubMcpClient(),
): Promise<Started> {
  const app = buildApp(testConfig(config), {
    mcp: mcp.client,
    anthropic,
    logger: silentLogger,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  running.push(app);
  const { port } = app.server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, mcp };
}

/** Consume the chat SSE response into an ordered event list. */
async function readEvents(response: Response): Promise<AgentEvent[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .map((frame) =>
      frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join(''),
    )
    .filter(Boolean)
    .map((data) => JSON.parse(data) as AgentEvent);
}

function chat(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close()));
});

describe('GET /copilot/capabilities', () => {
  it('reports the model, MCP roles, and discovered tools', async () => {
    const { url } = await start();
    const body = (await (await fetch(`${url}/copilot/capabilities`)).json()) as Record<
      string,
      never
    >;

    expect(body).toMatchObject({
      llm: { configured: true, model: 'claude-opus-5', effort: 'medium' },
      mcp: { connected: true, roles: { producer: true, consumer: true, admin: true } },
      explorerUrl: 'http://localhost:5173',
    });
  });

  it('reports the LLM as unconfigured when no key is present', async () => {
    const { url } = await start({ ANTHROPIC_API_KEY: undefined });
    const body = (await (await fetch(`${url}/copilot/capabilities`)).json()) as {
      llm: { configured: boolean };
    };

    expect(body.llm.configured).toBe(false);
  });

  it('never returns a credential', async () => {
    const { url } = await start();
    const text = await (await fetch(`${url}/copilot/capabilities`)).text();

    expect(text).not.toContain('sk-ant-test');
    expect(text).not.toContain('trg_admin_test');
    expect(text).not.toContain('trg_consumer_test');
  });
});

describe('POST /copilot/chat', () => {
  it('refuses with a setup message when no model credential is configured', async () => {
    const { url } = await start({ ANTHROPIC_API_KEY: undefined });
    const response = await chat(url, { turns: [{ role: 'user', content: 'hi' }] });

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe('not_configured');
  });

  it('rejects a malformed body', async () => {
    const { url } = await start();
    const response = await chat(url, { turns: [] });

    expect(response.status).toBe(400);
  });

  it('streams agent events as SSE', async () => {
    const { client } = stubAnthropic([{ text: 'Everything looks healthy.' }]);
    const { url } = await start({}, client);

    const response = await chat(url, { turns: [{ role: 'user', content: 'status?' }] });
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = await readEvents(response);
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('streams a full tool round-trip', async () => {
    const mcp = stubMcpClient({
      respond: () => ({
        raw: { eventId: 'evt-1', matchedSubscriptions: 1 },
        isError: false,
        text: 'ok',
      }),
    });
    const { client } = stubAnthropic([
      {
        toolUses: [
          { id: 'tu_1', name: 'ingest_event', input: { source: 'github', eventType: 'x' } },
        ],
      },
      { text: 'Published.' },
    ]);
    const { url } = await start({}, client, mcp);

    const events = await readEvents(
      await chat(url, { turns: [{ role: 'user', content: 'send an event' }] }),
    );

    expect(events.find((e) => e.type === 'tool_call')).toMatchObject({ name: 'ingest_event' });
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ ok: true });
  });

  it('never streams a lease token to the browser', async () => {
    const mcp = stubMcpClient({
      respond: () => ({
        raw: { count: 1, items: [{ deliveryId: 'd-1', leaseToken: 'lease_top_secret_9876' }] },
        isError: false,
        text: 'ok',
      }),
    });
    const { client } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'lease_deliveries', input: { subscriptionId: 's' } }] },
      { text: 'Leased one.' },
    ]);
    const { url } = await start({}, client, mcp);

    const raw = await (
      await chat(url, { turns: [{ role: 'user', content: 'check the inbox' }] })
    ).text();

    expect(raw).not.toContain('lease_top_secret_9876');
  });

  it('forwards approved confirmations to the agent', async () => {
    const mcp = stubMcpClient();
    const { client } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'delete_subscription', input: { subscriptionId: 's-1' } }] },
      { text: 'Deleted.' },
    ]);
    const { url } = await start({}, client, mcp);

    await readEvents(
      await chat(url, {
        turns: [{ role: 'user', content: 'delete it' }],
        confirmations: ['delete_subscription:{"subscriptionId":"s-1"}'],
      }),
    );

    expect(mcp.calls).toEqual([{ name: 'delete_subscription', args: { subscriptionId: 's-1' } }]);
  });
});

describe('GET /copilot/context', () => {
  it('returns the overview through MCP', async () => {
    const mcp = stubMcpClient({
      respond: (name) =>
        name === 'get_overview'
          ? { raw: { totalEvents: 7, pending: 2 }, isError: false, text: 'ok' }
          : { raw: null, isError: true, text: 'no' },
    });
    const { url } = await start({}, undefined, mcp);

    const body = (await (await fetch(`${url}/copilot/context`)).json()) as {
      overview: { totalEvents: number };
    };

    expect(body.overview.totalEvents).toBe(7);
  });

  it('returns null for a delivery lookup that fails, keeping the rest usable', async () => {
    const mcp = stubMcpClient({
      respond: (name) => {
        if (name === 'get_overview') return { raw: { totalEvents: 1 }, isError: false, text: 'ok' };
        throw new Error('NOT_FOUND');
      },
    });
    const { url } = await start({}, undefined, mcp);

    const body = (await (await fetch(`${url}/copilot/context?deliveryId=missing`)).json()) as {
      overview: unknown;
      delivery: unknown;
    };

    expect(body.overview).toMatchObject({ totalEvents: 1 });
    expect(body.delivery).toBeNull();
  });
});

describe('POST /copilot/reconnect', () => {
  it('returns fresh MCP capabilities', async () => {
    const { url } = await start();
    const body = (await (await fetch(`${url}/copilot/reconnect`, { method: 'POST' })).json()) as {
      mcp: { connected: boolean };
    };

    expect(body.mcp.connected).toBe(true);
  });
});
