import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from '../../src/server.js';
import type { TokenSet } from '../../src/tokens.js';

export const BASE_URL = 'http://api.test';

export interface RecordedRequest {
  url: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface StubResponse {
  status?: number;
  body?: unknown;
}

export interface FetchStub {
  impl: typeof fetch;
  calls: RecordedRequest[];
  last(): RecordedRequest;
}

/**
 * A fetch double that records every outbound call and returns whatever the
 * supplied handler decides, so tests assert on the exact HTTP the tools make.
 */
export function stubFetch(handler: (request: RecordedRequest) => StubResponse): FetchStub {
  const calls: RecordedRequest[] = [];

  const impl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    const recorded: RecordedRequest = {
      url,
      path: url.slice(BASE_URL.length),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(recorded);

    const result = handler(recorded);
    return new Response(result.body === undefined ? '' : JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  return {
    impl,
    calls,
    last() {
      const call = calls.at(-1);
      if (!call) throw new Error('No fetch calls were recorded');
      return call;
    },
  };
}

/** Wrap a payload in the API's success envelope. */
export function envelope(data: unknown): StubResponse {
  return { body: { data } };
}

/** Build the API's error envelope. */
export function apiError(status: number, code: string, message: string): StubResponse {
  return { status, body: { error: { code, message, requestId: 'req_test' } } };
}

export interface Harness {
  client: Client;
  close(): Promise<void>;
}

/** Connect an MCP client to a server built for the given credentials. */
export async function connectHarness(options: {
  tokens: TokenSet;
  fetchImpl?: typeof fetch;
  enableReset?: boolean;
}): Promise<Harness> {
  const server = createServer({
    baseUrl: BASE_URL,
    tokens: options.tokens,
    timeoutMs: 40_000,
    enableReset: options.enableReset ?? false,
    sessionId: 'test-session',
    fetchImpl: options.fetchImpl,
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

export async function toolNames(client: Client): Promise<string[]> {
  const { tools } = await client.listTools();
  return tools.map((tool) => tool.name).sort();
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

/** Parse the first (text) content block of a resource read as JSON. */
export function resourceJson<T = unknown>(result: ReadResourceResult): T {
  const first = result.contents[0];
  if (!first || !('text' in first)) {
    throw new Error('Expected a text content block in the resource result');
  }
  return JSON.parse(first.text) as T;
}

/** Concatenated text content of a tool result, for asserting on error messages. */
export function resultText(result: CallToolResult): string {
  return result.content
    .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}
