// @vitest-environment node
import type Anthropic from '@anthropic-ai/sdk';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import { createLogger, type Logger } from '@triggers/observability';
import type { CopilotConfig } from '../../src/config.js';
import type {
  McpCapabilities,
  McpToolCallOutcome,
  TriggersMcpClient,
} from '../../src/mcpClient.js';

export function testConfig(overrides: Partial<CopilotConfig> = {}): CopilotConfig {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    COPILOT_HOST: '127.0.0.1',
    COPILOT_PORT: 0,
    ANTHROPIC_API_KEY: 'sk-ant-test',
    COPILOT_MODEL: 'claude-opus-5',
    COPILOT_EFFORT: 'medium',
    COPILOT_MAX_TOKENS: 4096,
    COPILOT_MAX_ITERATIONS: 4,
    MCP_SERVER_URL: 'http://127.0.0.1:3100/mcp',
    TRIGGERS_API_URL: 'http://127.0.0.1:3000',
    TRIGGERS_ADMIN_TOKEN: 'trg_admin_test',
    TRIGGERS_PRODUCER_TOKEN: 'trg_producer_test',
    TRIGGERS_CONSUMER_TOKEN: 'trg_consumer_test',
    MCP_HTTP_AUTH_TOKEN: undefined,
    EXPLORER_URL: 'http://localhost:5173',
    COPILOT_WEB_DIR: 'dist/web',
    ...overrides,
  };
}

/**
 * The real Pino logger at `silent`. Fastify validates the instance it is given
 * (it needs `child()`), so a hand-rolled object would only prove the stub was
 * wrong.
 */
export const silentLogger: Logger = createLogger({ level: 'silent', name: 'copilot-test' });

export const DEFAULT_TOOLS: McpTool[] = [
  {
    name: 'get_overview',
    description: 'Aggregate counts',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ingest_event',
    description: 'Publish an event',
    inputSchema: {
      type: 'object',
      properties: { source: { type: 'string' }, eventType: { type: 'string' } },
      required: ['source', 'eventType'],
    },
  },
  {
    name: 'lease_deliveries',
    description: 'Lease work',
    inputSchema: {
      type: 'object',
      properties: { subscriptionId: { type: 'string' } },
      required: ['subscriptionId'],
    },
  },
  {
    name: 'ack_delivery',
    description: 'Acknowledge',
    inputSchema: {
      type: 'object',
      properties: { deliveryId: { type: 'string' }, leaseToken: { type: 'string' } },
      required: ['deliveryId', 'leaseToken'],
    },
  },
  {
    name: 'delete_subscription',
    description: 'Delete a subscription',
    inputSchema: {
      type: 'object',
      properties: { subscriptionId: { type: 'string' } },
      required: ['subscriptionId'],
    },
  },
];

export interface StubMcpOptions {
  tools?: McpTool[];
  respond?: (
    name: string,
    args: Record<string, unknown>,
  ) => McpToolCallOutcome | Promise<McpToolCallOutcome>;
  capabilities?: Partial<McpCapabilities>;
}

export interface StubMcp {
  client: TriggersMcpClient;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
}

/** A TriggersMcpClient stand-in that records calls. Protocol is exercised separately. */
export function stubMcpClient(options: StubMcpOptions = {}): StubMcp {
  const tools = options.tools ?? DEFAULT_TOOLS;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const client = {
    listTools: async () => tools,
    hasTool: (name: string) => tools.some((tool) => tool.name === name),
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (options.respond) return options.respond(name, args);
      return { raw: { ok: true }, isError: false, text: '{"ok":true}' };
    },
    capabilities: async (): Promise<McpCapabilities> => ({
      connected: true,
      serverName: 'triggers',
      serverVersion: '0.1.0',
      roles: { producer: true, consumer: true, admin: true },
      toolNames: tools.map((tool) => tool.name),
      resourceUris: ['triggers://overview'],
      error: null,
      ...options.capabilities,
    }),
    reset: async () => undefined,
    readResource: async () => null,
  } as unknown as TriggersMcpClient;

  return { client, calls };
}

/** One scripted model turn. */
export interface ScriptedTurn {
  text?: string;
  toolUses?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason?: Anthropic.Message['stop_reason'];
}

/**
 * Minimal Anthropic stand-in: async-iterable stream plus finalMessage(), which
 * is exactly the surface the agent uses.
 */
export function stubAnthropic(turns: ScriptedTurn[]): {
  client: Anthropic;
  requests: Array<Record<string, unknown>>;
} {
  const requests: Array<Record<string, unknown>> = [];
  let index = 0;

  const stream = (params: Record<string, unknown>) => {
    requests.push(params);
    const turn = turns[Math.min(index, turns.length - 1)] ?? {};
    index += 1;

    const content: Anthropic.ContentBlock[] = [];
    if (turn.text) content.push({ type: 'text', text: turn.text, citations: null });
    for (const use of turn.toolUses ?? []) {
      content.push({
        type: 'tool_use',
        id: use.id,
        name: use.name,
        input: use.input,
        caller: { type: 'direct' },
      });
    }

    const message = {
      id: `msg_${index}`,
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5',
      content,
      stop_reason: turn.stopReason ?? (turn.toolUses?.length ? 'tool_use' : 'end_turn'),
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    } as unknown as Anthropic.Message;

    return {
      async *[Symbol.asyncIterator]() {
        if (turn.text) {
          yield {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: turn.text },
          };
        }
      },
      finalMessage: async () => message,
    };
  };

  return {
    client: { beta: { messages: { stream } } } as unknown as Anthropic,
    requests,
  };
}
