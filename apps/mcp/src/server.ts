import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TriggersClient } from './client.js';
import { registerResources } from './resources.js';
import { registerDeliveryTools } from './tools/deliveries.js';
import { registerEventTools } from './tools/events.js';
import { registerExplorerTools } from './tools/explorer.js';
import { registerInboxTools } from './tools/inbox.js';
import { registerSubscriptionTools } from './tools/subscriptions.js';
import { hasAnyToken, type TokenSet } from './tokens.js';

export const SERVER_NAME = 'triggers';
export const SERVER_VERSION = '0.1.0';

export interface CreateServerOptions {
  baseUrl: string;
  tokens: TokenSet;
  timeoutMs: number;
  enableReset: boolean;
  /** Distinguishes ACK process ids between sessions; defaults to `mcp`. */
  sessionId?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Guidance the client surfaces to the model alongside the tool list. Written to
 * cover the two things a model reliably gets wrong about a leased queue:
 * settling what it leases, and treating redelivery as normal rather than an error.
 */
const INSTRUCTIONS = `Tools for the Triggers event delivery platform.

Producers ingest events; the platform fans each event out to every matching subscription as a "delivery"; consumers lease deliveries, process them, then acknowledge them.

Working rules:
- Deliveries are leased, not consumed. Anything you lease with lease_deliveries MUST be settled with ack_delivery on success or nack_delivery on failure. An unsettled lease is redelivered once its visibility timeout expires.
- Delivery is at-least-once. Seeing the same event twice is expected behaviour, not a bug — make handling idempotent.
- An empty result from lease_deliveries is normal. Use the wait parameter to long-poll instead of busy-looping.
- Events only reach subscriptions created before the event was ingested, and filters are exact-match. If matchedSubscriptions is 0, check list_subscriptions.
- Prefer get_overview or list_events to answer "what happened to my event?" before reaching for the delivery-level tools.`;

/** Build a fully wired MCP server for one set of credentials. */
export function createServer(options: CreateServerOptions): McpServer {
  if (!hasAnyToken(options.tokens)) {
    throw new Error(
      'No Triggers API tokens configured. Set at least one of TRIGGERS_ADMIN_TOKEN, ' +
        'TRIGGERS_PRODUCER_TOKEN, or TRIGGERS_CONSUMER_TOKEN.',
    );
  }

  const client = new TriggersClient({
    baseUrl: options.baseUrl,
    tokens: options.tokens,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    consumerProcessPrefix: options.sessionId ? `mcp:${options.sessionId}` : 'mcp',
  });

  // Capabilities are deliberately not declared up front: registerTool and
  // registerResource advertise them as things are registered, so a key that
  // gets no resources (a producer-only session) does not claim to serve them.
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerEventTools(server, client);
  registerSubscriptionTools(server, client);
  registerInboxTools(server, client);
  registerDeliveryTools(server, client);
  registerExplorerTools(server, client, { enableReset: options.enableReset });
  registerResources(server, client);

  return server;
}
