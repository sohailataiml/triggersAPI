import { randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type RawServerDefault,
} from 'fastify';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createLogger, type Logger } from '@triggers/observability';
import { loadMcpConfig, type McpConfig } from './config.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';
import {
  availableRoles,
  hasAnyToken,
  tokensFromConfig,
  tokensFromHeaders,
  type TokenSet,
} from './tokens.js';

/** Ample headroom over the API's 256KB event-body limit. */
const BODY_LIMIT_BYTES = 1_048_576;

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

type TokenResolution = { ok: true; tokens: TokenSet } | { ok: false; message: string };

/** Constant-time comparison that does not leak length through an early return. */
function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/**
 * Resolve the Triggers credentials for a new session.
 *
 * In `header` mode the caller supplies their own keys per request and this
 * process stores none. In `shared` mode the caller proves knowledge of a single
 * gateway secret and the server's own env keys are used — convenient for a
 * single-operator deployment, but it lends every caller the server's roles.
 */
export function resolveSessionTokens(
  config: McpConfig,
  headers: Record<string, string | string[] | undefined>,
): TokenResolution {
  if (config.MCP_HTTP_AUTH_MODE === 'shared') {
    const expected = config.MCP_HTTP_AUTH_TOKEN;
    if (!expected) {
      return { ok: false, message: 'Server misconfigured: MCP_HTTP_AUTH_TOKEN is not set.' };
    }
    const authorization = Array.isArray(headers.authorization)
      ? headers.authorization[0]
      : headers.authorization;
    const provided = bearerToken(authorization);
    if (!provided || !tokensMatch(provided, expected)) {
      return { ok: false, message: 'Invalid or missing gateway credential.' };
    }
    return { ok: true, tokens: tokensFromConfig(config) };
  }

  const tokens = tokensFromHeaders(headers);
  if (!hasAnyToken(tokens)) {
    return {
      ok: false,
      message:
        'Supply at least one Triggers API key via the X-Triggers-Admin-Token, ' +
        'X-Triggers-Producer-Token, or X-Triggers-Consumer-Token header.',
    };
  }
  return { ok: true, tokens };
}

/** Fail fast on option combinations that would only break at request time. */
export function assertHttpConfig(config: McpConfig): void {
  if (config.MCP_HTTP_AUTH_MODE !== 'shared') return;

  if (!config.MCP_HTTP_AUTH_TOKEN) {
    throw new Error('MCP_HTTP_AUTH_MODE=shared requires MCP_HTTP_AUTH_TOKEN to be set.');
  }
  if (!hasAnyToken(tokensFromConfig(config))) {
    throw new Error(
      'MCP_HTTP_AUTH_MODE=shared requires at least one TRIGGERS_*_TOKEN for the server to use.',
    );
  }
}

export interface HttpAppOptions {
  /** Injected in tests; sessions otherwise use global fetch. */
  fetchImpl?: typeof fetch;
}

/** Fastify instance parameterised with the Pino logger this app is built with. */
export type McpHttpApp = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  Logger
>;

/**
 * Build the Streamable HTTP surface. One MCP server instance is created per
 * session so that, in `header` auth mode, each caller's tool list reflects
 * only the roles their own keys grant.
 */
export function createHttpApp(config: McpConfig, options: HttpAppOptions = {}): McpHttpApp {
  assertHttpConfig(config);

  const app = Fastify({
    loggerInstance: createLogger({ level: config.LOG_LEVEL, name: 'triggers-mcp-http' }),
    bodyLimit: BODY_LIMIT_BYTES,
  });
  const sessions = new Map<string, Session>();

  app.get('/health', async () => ({
    status: 'ok',
    server: SERVER_NAME,
    version: SERVER_VERSION,
    authMode: config.MCP_HTTP_AUTH_MODE,
    sessions: sessions.size,
  }));

  const sessionIdOf = (request: FastifyRequest): string | undefined => {
    const raw = request.headers['mcp-session-id'];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  app.post('/mcp', async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = sessionIdOf(request);
    const existing = sessionId ? sessions.get(sessionId) : undefined;

    if (existing) {
      reply.hijack();
      await existing.transport.handleRequest(request.raw, reply.raw, request.body);
      return;
    }

    if (sessionId) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Unknown or expired MCP session.' } });
    }

    if (!isInitializeRequest(request.body)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Expected an initialize request, or an Mcp-Session-Id header.',
        },
      });
    }

    const auth = resolveSessionTokens(config, request.headers);
    if (!auth.ok) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: auth.message } });
    }

    const newSessionId = randomUUID();
    const server = createServer({
      baseUrl: config.TRIGGERS_API_URL,
      tokens: auth.tokens,
      timeoutMs: config.TRIGGERS_REQUEST_TIMEOUT_MS,
      enableReset: config.TRIGGERS_MCP_ENABLE_RESET,
      sessionId: newSessionId,
      fetchImpl: options.fetchImpl,
    });

    const dnsProtection =
      config.MCP_ALLOWED_HOSTS.length > 0 || config.MCP_ALLOWED_ORIGINS.length > 0
        ? {
            enableDnsRebindingProtection: true,
            allowedHosts: config.MCP_ALLOWED_HOSTS,
            allowedOrigins: config.MCP_ALLOWED_ORIGINS,
          }
        : {};

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, server });
        app.log.info({ sessionId: id, roles: availableRoles(auth.tokens) }, 'MCP session opened');
      },
      ...dnsProtection,
    });

    transport.onclose = () => {
      if (!sessions.delete(newSessionId)) return;
      void server.close();
      app.log.info({ sessionId: newSessionId }, 'MCP session closed');
    };

    await server.connect(transport);
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // Server-initiated notifications (SSE) and explicit session termination both
  // route straight into the transport, which owns the response lifecycle.
  const forwardToSession = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sessionId = sessionIdOf(request);
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) {
      await reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Unknown or expired MCP session.' } });
      return;
    }
    reply.hijack();
    await session.transport.handleRequest(request.raw, reply.raw);
  };

  app.get('/mcp', forwardToSession);
  app.delete('/mcp', forwardToSession);

  app.addHook('onClose', async () => {
    for (const session of sessions.values()) {
      await session.transport.close();
    }
    sessions.clear();
  });

  return app;
}

async function main(): Promise<void> {
  const config = loadMcpConfig();
  const app = createHttpApp(config);

  await app.listen({ host: config.MCP_HTTP_HOST, port: config.MCP_HTTP_PORT });
  app.log.info(
    {
      apiUrl: config.TRIGGERS_API_URL,
      authMode: config.MCP_HTTP_AUTH_MODE,
      endpoint: `http://${config.MCP_HTTP_HOST}:${config.MCP_HTTP_PORT}/mcp`,
    },
    'triggers MCP server ready on streamable HTTP transport',
  );

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Only start listening when executed directly, so tests can import the factory.
const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `triggers MCP HTTP server failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
