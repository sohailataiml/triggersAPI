import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { CopilotConfig } from './config.js';
import { CopilotError, toCopilotError } from './errors.js';

export const TRIGGERS_ROLES = ['producer', 'consumer', 'admin'] as const;
export type TriggersRole = (typeof TRIGGERS_ROLES)[number];

/**
 * Which role each tool implies. Used only to *describe* the connection to the
 * user — the MCP server is the authority on what is actually registered, and a
 * tool absent from `listTools` is simply never offered to the model.
 */
const ROLE_BY_TOOL: Record<string, TriggersRole> = {
  ingest_event: 'producer',
  lease_deliveries: 'consumer',
  ack_delivery: 'consumer',
  nack_delivery: 'consumer',
  get_delivery: 'admin',
  replay_delivery: 'admin',
  create_subscription: 'admin',
  update_subscription: 'admin',
  delete_subscription: 'admin',
  reset_workspace: 'admin',
};

/** Tools that change platform state and are worth calling out in the UI. */
export const MUTATING_TOOLS = new Set([
  'ingest_event',
  'lease_deliveries',
  'ack_delivery',
  'nack_delivery',
  'replay_delivery',
  'create_subscription',
  'update_subscription',
  'delete_subscription',
  'reset_workspace',
]);

/**
 * Tools destructive or broad enough to require explicit user confirmation
 * before the agent may run them. Routine demo mutations are not on this list.
 */
export const CONFIRM_REQUIRED_TOOLS = new Set(['delete_subscription', 'reset_workspace']);

export interface McpCapabilities {
  connected: boolean;
  serverName: string | null;
  serverVersion: string | null;
  roles: Record<TriggersRole, boolean>;
  toolNames: string[];
  resourceUris: string[];
  /** Populated when the last connection attempt failed. */
  error: string | null;
}

export interface McpToolCallOutcome {
  /** Unmasked — passed back to the model. */
  raw: unknown;
  isError: boolean;
  /** Human-readable text content, used as the model-facing tool result. */
  text: string;
}

const CONNECT_TIMEOUT_MS = 15_000;

/**
 * MCP client for the Triggers MCP server over Streamable HTTP.
 *
 * All Triggers credentials live here, server-side. The browser talks only to
 * this process, so an admin token is never exposed to page JavaScript.
 */
export class TriggersMcpClient {
  private client: Client | undefined;
  private connecting: Promise<Client> | undefined;
  private tools: Tool[] = [];
  private resources: Array<{ uri: string; name?: string; description?: string }> = [];
  private lastError: string | null = null;
  private serverInfo: { name: string; version: string } | null = null;

  constructor(private readonly config: CopilotConfig) {}

  /** Role tokens travel as headers; `header` mode is the MCP server's default. */
  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.TRIGGERS_ADMIN_TOKEN) {
      headers['X-Triggers-Admin-Token'] = this.config.TRIGGERS_ADMIN_TOKEN;
    }
    if (this.config.TRIGGERS_PRODUCER_TOKEN) {
      headers['X-Triggers-Producer-Token'] = this.config.TRIGGERS_PRODUCER_TOKEN;
    }
    if (this.config.TRIGGERS_CONSUMER_TOKEN) {
      headers['X-Triggers-Consumer-Token'] = this.config.TRIGGERS_CONSUMER_TOKEN;
    }
    if (this.config.MCP_HTTP_AUTH_TOKEN) {
      headers.Authorization = `Bearer ${this.config.MCP_HTTP_AUTH_TOKEN}`;
    }
    return headers;
  }

  private async connect(): Promise<Client> {
    const client = new Client({ name: 'zapier-automation-copilot', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(this.config.MCP_SERVER_URL), {
      requestInit: { headers: this.headers() },
    });

    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });

    const [{ tools }, resources] = await Promise.all([
      client.listTools(),
      // A producer-only key registers no resources, so the server does not
      // advertise the capability and this call is a protocol error, not a bug.
      client.listResources().catch(() => ({ resources: [] })),
    ]);

    this.tools = tools;
    this.resources = resources.resources ?? [];
    const info = client.getServerVersion();
    this.serverInfo = info ? { name: info.name, version: info.version } : null;
    this.lastError = null;

    // A dropped transport must not leave a stale client cached.
    transport.onclose = () => {
      if (this.client === client) this.client = undefined;
    };

    return client;
  }

  /** Connect lazily, coalescing concurrent attempts into one. */
  async ensureConnected(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    this.connecting = this.connect()
      .then((client) => {
        this.client = client;
        return client;
      })
      .catch((cause: unknown) => {
        const error = toCopilotError(cause);
        this.lastError = error.message;
        throw error;
      })
      .finally(() => {
        this.connecting = undefined;
      });

    return this.connecting;
  }

  /** Drop the cached connection so the next call reconnects from scratch. */
  async reset(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.tools = [];
    this.resources = [];
    await client?.close().catch(() => undefined);
  }

  /** Capability snapshot for the UI. Never throws — a failure is a state. */
  async capabilities(): Promise<McpCapabilities> {
    try {
      await this.ensureConnected();
    } catch {
      // lastError is already populated by ensureConnected.
    }

    const toolNames = this.tools.map((tool) => tool.name).sort();
    const roles: Record<TriggersRole, boolean> = {
      producer: false,
      consumer: false,
      admin: false,
    };
    for (const name of toolNames) {
      const role = ROLE_BY_TOOL[name];
      if (role) roles[role] = true;
    }

    return {
      connected: Boolean(this.client),
      serverName: this.serverInfo?.name ?? null,
      serverVersion: this.serverInfo?.version ?? null,
      roles,
      toolNames,
      resourceUris: this.resources.map((resource) => resource.uri).sort(),
      error: this.lastError,
    };
  }

  /** Tool definitions as discovered from the server (no local hard-coding). */
  async listTools(): Promise<Tool[]> {
    await this.ensureConnected();
    return this.tools;
  }

  hasTool(name: string): boolean {
    return this.tools.some((tool) => tool.name === name);
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolCallOutcome> {
    if (!this.hasTool(name)) {
      throw new CopilotError({
        kind: 'tool_failed',
        message: `The tool "${name}" is not available with the current MCP credentials.`,
        retryable: false,
      });
    }

    const client = await this.ensureConnected();

    let result: CallToolResult;
    try {
      result = (await client.callTool({ name, arguments: args }, undefined, {
        signal,
      })) as CallToolResult;
    } catch (cause) {
      // A transport-level failure invalidates the cached session.
      await this.reset();
      throw toCopilotError(cause);
    }

    const text = (result.content ?? [])
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return {
      raw: result.structuredContent ?? text,
      isError: Boolean(result.isError),
      text: text || JSON.stringify(result.structuredContent ?? {}),
    };
  }

  async readResource(uri: string): Promise<unknown> {
    const client = await this.ensureConnected();
    const result = await client.readResource({ uri });
    const first = result.contents[0];
    if (!first || !('text' in first)) return null;
    try {
      return JSON.parse(first.text) as unknown;
    } catch {
      return first.text;
    }
  }
}
