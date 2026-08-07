import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  assertHttpConfig,
  createHttpApp,
  resolveSessionTokens,
  type McpHttpApp,
} from '../src/http.js';
import type { McpConfig } from '../src/config.js';
import { BASE_URL, envelope, stubFetch, type FetchStub } from './helpers/harness.js';
import * as fixtures from './helpers/fixtures.js';

function config(overrides: Partial<McpConfig> = {}): McpConfig {
  return {
    TRIGGERS_API_URL: BASE_URL,
    TRIGGERS_ADMIN_TOKEN: undefined,
    TRIGGERS_PRODUCER_TOKEN: undefined,
    TRIGGERS_CONSUMER_TOKEN: undefined,
    TRIGGERS_REQUEST_TIMEOUT_MS: 40_000,
    TRIGGERS_MCP_ENABLE_RESET: false,
    MCP_HTTP_HOST: '127.0.0.1',
    MCP_HTTP_PORT: 0,
    MCP_HTTP_AUTH_MODE: 'header',
    MCP_HTTP_AUTH_TOKEN: undefined,
    MCP_ALLOWED_HOSTS: [],
    MCP_ALLOWED_ORIGINS: [],
    LOG_LEVEL: 'silent',
    ...overrides,
  };
}

interface Running {
  url: string;
  app: McpHttpApp;
  fetchStub: FetchStub;
}

const running: Running[] = [];
const clients: Client[] = [];

async function start(
  overrides: Partial<McpConfig> = {},
  respond: () => ReturnType<typeof envelope> = () => envelope(fixtures.overview),
): Promise<Running> {
  const fetchStub = stubFetch(respond);
  const app = createHttpApp(config(overrides), { fetchImpl: fetchStub.impl });
  await app.listen({ host: '127.0.0.1', port: 0 });

  const { port } = app.server.address() as AddressInfo;
  const instance: Running = { url: `http://127.0.0.1:${port}`, app, fetchStub };
  running.push(instance);
  return instance;
}

async function connect(instance: Running, headers: Record<string, string>): Promise<Client> {
  const client = new Client({ name: 'http-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${instance.url}/mcp`), {
    requestInit: { headers },
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => undefined)));
  await Promise.all(running.splice(0).map((instance) => instance.app.close()));
});

describe('streamable HTTP transport', () => {
  it('serves a health endpoint without authentication', async () => {
    const instance = await start();
    const response = await fetch(`${instance.url}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', server: 'triggers' });
  });

  it('completes an initialize handshake and lists tools', async () => {
    const instance = await start();
    const client = await connect(instance, { 'X-Triggers-Admin-Token': 'admin-token' });

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toContain('get_overview');
    expect(client.getServerVersion()?.name).toBe('triggers');
  });

  it('executes a tool call over HTTP against the upstream API', async () => {
    const instance = await start();
    const client = await connect(instance, { 'X-Triggers-Admin-Token': 'admin-token' });

    const result = (await client.callTool({ name: 'get_overview' })) as CallToolResult;

    expect(result.structuredContent).toEqual(fixtures.overview);
    expect(instance.fetchStub.last().headers.Authorization).toBe('Bearer admin-token');
  });

  it('scopes each session to the roles its own headers grant', async () => {
    const instance = await start();
    const producer = await connect(instance, { 'X-Triggers-Producer-Token': 'producer-token' });
    const admin = await connect(instance, { 'X-Triggers-Admin-Token': 'admin-token' });

    const producerTools = (await producer.listTools()).tools.map((tool) => tool.name);
    const adminTools = (await admin.listTools()).tools.map((tool) => tool.name);

    expect(producerTools).toEqual(['ingest_event']);
    expect(adminTools).toContain('replay_delivery');
    expect(adminTools).not.toContain('ingest_event');
  });

  it('rejects an initialize with no credentials', async () => {
    const instance = await start();

    await expect(connect(instance, {})).rejects.toThrow();
  });

  it('rejects an unknown session id', async () => {
    const instance = await start();
    const response = await fetch(`${instance.url}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Mcp-Session-Id': 'nope',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(response.status).toBe(404);
  });

  it('rejects a non-initialize POST that carries no session', async () => {
    const instance = await start();
    const response = await fetch(`${instance.url}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    expect(response.status).toBe(400);
  });

  it('accepts a gateway credential in shared mode and uses the server keys', async () => {
    const instance = await start({
      MCP_HTTP_AUTH_MODE: 'shared',
      MCP_HTTP_AUTH_TOKEN: 'gateway-secret',
      TRIGGERS_ADMIN_TOKEN: 'server-admin-token',
    });

    const client = await connect(instance, { Authorization: 'Bearer gateway-secret' });
    await client.callTool({ name: 'get_overview' });

    expect(instance.fetchStub.last().headers.Authorization).toBe('Bearer server-admin-token');
  });

  it('rejects a wrong gateway credential in shared mode', async () => {
    const instance = await start({
      MCP_HTTP_AUTH_MODE: 'shared',
      MCP_HTTP_AUTH_TOKEN: 'gateway-secret',
      TRIGGERS_ADMIN_TOKEN: 'server-admin-token',
    });

    await expect(connect(instance, { Authorization: 'Bearer wrong' })).rejects.toThrow();
  });

  it('ignores caller-supplied role headers in shared mode', async () => {
    const instance = await start({
      MCP_HTTP_AUTH_MODE: 'shared',
      MCP_HTTP_AUTH_TOKEN: 'gateway-secret',
      TRIGGERS_ADMIN_TOKEN: 'server-admin-token',
    });

    const client = await connect(instance, {
      Authorization: 'Bearer gateway-secret',
      'X-Triggers-Producer-Token': 'smuggled-token',
    });

    // The smuggled producer key must not grant the session a producer role.
    expect((await client.listTools()).tools.map((tool) => tool.name)).not.toContain('ingest_event');
  });
});

describe('HTTP configuration guards', () => {
  it('refuses to start in shared mode without a gateway token', () => {
    expect(() => assertHttpConfig(config({ MCP_HTTP_AUTH_MODE: 'shared' }))).toThrow(
      /MCP_HTTP_AUTH_TOKEN/,
    );
  });

  it('refuses to start in shared mode with no Triggers keys to lend', () => {
    expect(() =>
      assertHttpConfig(
        config({ MCP_HTTP_AUTH_MODE: 'shared', MCP_HTTP_AUTH_TOKEN: 'gateway-secret' }),
      ),
    ).toThrow(/TRIGGERS_\*_TOKEN/);
  });

  it('allows header mode with no server-side keys at all', () => {
    expect(() => assertHttpConfig(config())).not.toThrow();
  });
});

describe('resolveSessionTokens', () => {
  it('reads per-role headers in header mode', () => {
    const result = resolveSessionTokens(config(), {
      'x-triggers-consumer-token': 'consumer-key',
    });

    expect(result).toEqual({ ok: true, tokens: { consumer: 'consumer-key' } });
  });

  it('rejects a header-mode request with no role headers', () => {
    const result = resolveSessionTokens(config(), { authorization: 'Bearer something' });

    expect(result.ok).toBe(false);
  });
});
