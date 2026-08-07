// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpApp, type McpHttpApp } from '@triggers/mcp/src/http.js';
import type { McpConfig } from '@triggers/mcp/src/config.js';
import { TriggersMcpClient } from '../src/mcpClient.js';
import { maskSensitive } from '../src/masking.js';
import { testConfig } from './helpers/stubs.js';

/**
 * Drives the real Triggers MCP server over the real Streamable HTTP transport.
 *
 * Only the Triggers REST API underneath is stubbed — the MCP protocol boundary
 * itself (initialize, tools/list, tools/call, session headers, role gating) is
 * genuinely exercised, which is the boundary most worth not mocking.
 */

const SUBSCRIPTION_ID = '0198c1f0-0000-7000-8000-000000000001';
const DELIVERY_ID = '0198c1f0-0000-7000-8000-000000000003';

const OVERVIEW = {
  totalEvents: 4,
  pending: 1,
  activeLeases: 1,
  retryScheduled: 0,
  deadLetter: 1,
  acknowledged: 1,
};

const LEASE_RESPONSE = {
  items: [
    {
      deliveryId: DELIVERY_ID,
      eventId: '0198c1f0-0000-7000-8000-000000000002',
      leaseToken: 'lease_realsecret_abcdef123456',
      leaseUntil: '2026-08-07T12:01:00.000Z',
      attempt: 1,
      event: {
        source: 'github',
        eventType: 'pull_request.opened',
        subject: 'repo:acme/widgets',
        payload: { pullRequestId: 431 },
        metadata: {},
        receivedAt: '2026-08-07T12:00:00.000Z',
      },
    },
  ],
  nextPollAfterMs: 0,
};

/** Minimal Triggers REST stand-in so no Postgres is required. */
const apiStub = (async (input: Parameters<typeof fetch>[0]) => {
  const url = String(input);
  const body = url.includes('/v1/explorer/overview')
    ? OVERVIEW
    : url.includes('/v1/inbox')
      ? LEASE_RESPONSE
      : url.includes('/v1/subscriptions')
        ? []
        : {};
  return new Response(JSON.stringify({ data: body }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

function mcpConfig(): McpConfig {
  return {
    TRIGGERS_API_URL: 'http://api.test',
    TRIGGERS_ADMIN_TOKEN: 'trg_admin',
    TRIGGERS_PRODUCER_TOKEN: undefined,
    TRIGGERS_CONSUMER_TOKEN: 'trg_consumer',
    TRIGGERS_REQUEST_TIMEOUT_MS: 40_000,
    TRIGGERS_MCP_ENABLE_RESET: false,
    MCP_HTTP_HOST: '127.0.0.1',
    MCP_HTTP_PORT: 0,
    MCP_HTTP_AUTH_MODE: 'header',
    MCP_HTTP_AUTH_TOKEN: undefined,
    MCP_ALLOWED_HOSTS: [],
    MCP_ALLOWED_ORIGINS: [],
    LOG_LEVEL: 'silent',
  };
}

describe('Copilot ↔ real MCP server', () => {
  let mcpApp: McpHttpApp;
  let client: TriggersMcpClient;

  beforeAll(async () => {
    mcpApp = createHttpApp(mcpConfig(), { fetchImpl: apiStub });
    await mcpApp.listen({ host: '127.0.0.1', port: 0 });
    const { port } = mcpApp.server.address() as AddressInfo;

    client = new TriggersMcpClient(
      testConfig({
        MCP_SERVER_URL: `http://127.0.0.1:${port}/mcp`,
        TRIGGERS_ADMIN_TOKEN: 'trg_admin',
        // Deliberately omitted, to prove role gating is honoured end to end.
        TRIGGERS_PRODUCER_TOKEN: undefined,
        TRIGGERS_CONSUMER_TOKEN: 'trg_consumer',
      }),
    );
  }, 60_000);

  afterAll(async () => {
    await client?.reset();
    await mcpApp?.close();
  });

  it('completes a real MCP handshake and discovers tools', async () => {
    const capabilities = await client.capabilities();

    expect(capabilities.connected).toBe(true);
    expect(capabilities.serverName).toBe('triggers');
    expect(capabilities.toolNames).toContain('get_overview');
    expect(capabilities.toolNames).toContain('lease_deliveries');
  });

  it('derives roles from the tools the server actually registered', async () => {
    const capabilities = await client.capabilities();

    // No producer token was forwarded, so ingest_event must not be offered.
    expect(capabilities.roles.producer).toBe(false);
    expect(capabilities.roles.consumer).toBe(true);
    expect(capabilities.roles.admin).toBe(true);
    expect(capabilities.toolNames).not.toContain('ingest_event');
  });

  it('discovers the MCP resources', async () => {
    const capabilities = await client.capabilities();

    expect(capabilities.resourceUris).toContain('triggers://overview');
    expect(capabilities.resourceUris).toContain('triggers://subscriptions');
  });

  it('calls a real tool through the protocol and unwraps the result', async () => {
    const outcome = await client.callTool('get_overview', {});

    expect(outcome.isError).toBe(false);
    expect(outcome.raw).toMatchObject({ totalEvents: 4, deadLetter: 1 });
  });

  it('reads an MCP resource', async () => {
    const overview = await client.readResource('triggers://overview');

    expect(overview).toMatchObject({ totalEvents: 4 });
  });

  it('refuses a tool the server did not register', async () => {
    await expect(client.callTool('ingest_event', { source: 'x', eventType: 'y' })).rejects.toThrow(
      /not available with the current MCP credentials/,
    );
  });

  it('masks the lease token from a genuine lease round-trip', async () => {
    const outcome = await client.callTool('lease_deliveries', {
      subscriptionId: SUBSCRIPTION_ID,
      wait: 0,
    });

    // The model receives the real token…
    expect(JSON.stringify(outcome.raw)).toContain('lease_realsecret_abcdef123456');
    // …and the browser copy does not.
    const masked = JSON.stringify(maskSensitive(outcome.raw));
    expect(masked).not.toContain('lease_realsecret_abcdef123456');
    expect(masked).toContain('••••');
  });

  it('reports an invalid tool argument as a tool error, not a crash', async () => {
    const outcome = await client.callTool('lease_deliveries', { subscriptionId: 'not-a-uuid' });

    expect(outcome.isError).toBe(true);
  });

  it('recovers after an explicit reset by opening a new session', async () => {
    await client.reset();
    const capabilities = await client.capabilities();

    expect(capabilities.connected).toBe(true);
    expect(capabilities.toolNames.length).toBeGreaterThan(0);
  });
});

describe('Copilot ↔ unreachable MCP server', () => {
  it('reports a connection failure as state rather than throwing', async () => {
    const client = new TriggersMcpClient(testConfig({ MCP_SERVER_URL: 'http://127.0.0.1:9/mcp' }));

    const capabilities = await client.capabilities();

    expect(capabilities.connected).toBe(false);
    expect(capabilities.toolNames).toEqual([]);
    expect(capabilities.error).toBeTruthy();
  }, 30_000);
});
