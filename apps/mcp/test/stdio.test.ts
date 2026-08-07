import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Boots the real stdio entrypoint as a child process and drives it with a real
 * MCP client. This is the only test that proves the transport a desktop client
 * actually uses works — in particular that logging goes to stderr and does not
 * corrupt the JSON-RPC stream on stdout.
 *
 * No API is running, so tool calls are expected to fail cleanly.
 */
describe('stdio entrypoint', () => {
  let client: Client;

  beforeAll(async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/stdio.ts'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        TRIGGERS_API_URL: 'http://127.0.0.1:9',
        TRIGGERS_ADMIN_TOKEN: 'admin-token',
        TRIGGERS_PRODUCER_TOKEN: 'producer-token',
        TRIGGERS_CONSUMER_TOKEN: 'consumer-token',
        // Logging is on so a stray stdout write would break the handshake below.
        LOG_LEVEL: 'info',
      },
    });

    client = new Client({ name: 'stdio-test-client', version: '1.0.0' });
    await client.connect(transport);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
  });

  it('completes the handshake with logging enabled', () => {
    expect(client.getServerVersion()?.name).toBe('triggers');
    expect(client.getInstructions()).toContain('MUST be settled');
  });

  it('serves the full tool surface for a three-role configuration', async () => {
    const { tools } = await client.listTools();

    expect(tools).toHaveLength(14);
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['ingest_event', 'lease_deliveries', 'ack_delivery', 'get_overview']),
    );
  });

  it('serves resources', async () => {
    const { resources } = await client.listResources();

    expect(resources.map((resource) => resource.uri)).toContain('triggers://overview');
  });

  it('returns a clean error result when the API is unreachable', async () => {
    const result = (await client.callTool({ name: 'get_overview' })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('DEPENDENCY_UNAVAILABLE');
  }, 60_000);
});
