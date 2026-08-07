import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type RawServerDefault,
} from 'fastify';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type Anthropic from '@anthropic-ai/sdk';
import { createLogger, type Logger } from '@triggers/observability';
import { z } from 'zod';
import { CopilotAgent, type AgentEvent } from './agent.js';
import { hasLlmCredential, type CopilotConfig } from './config.js';
import { emptyContext } from './context.js';
import { toCopilotError } from './errors.js';
import { LeaseRegistry } from './leaseRegistry.js';
import { TriggersMcpClient } from './mcpClient.js';
import { buildSystemPrompt } from './systemPrompt.js';

/** Event payloads can carry a full delivery list; give them room. */
const BODY_LIMIT_BYTES = 2_097_152;

const chatBodySchema = z.object({
  turns: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(32_000),
      }),
    )
    .min(1)
    .max(100),
  context: z
    .object({
      selectedEventId: z.string().nullable().default(null),
      selectedDeliveryId: z.string().nullable().default(null),
      selectedSubscriptionId: z.string().nullable().default(null),
    })
    .default(emptyContext()),
  confirmations: z.array(z.string().max(4096)).max(20).default([]),
});

export type CopilotApp = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse<IncomingMessage>,
  Logger
>;

export interface BuildAppOptions {
  /** Injected in tests. */
  mcp?: TriggersMcpClient;
  anthropic?: Anthropic;
  logger?: Logger;
}

export function buildApp(config: CopilotConfig, options: BuildAppOptions = {}): CopilotApp {
  const log = options.logger ?? createLogger({ level: config.LOG_LEVEL, name: 'triggers-copilot' });

  const app = Fastify({ loggerInstance: log, bodyLimit: BODY_LIMIT_BYTES });
  const mcp = options.mcp ?? new TriggersMcpClient(config);
  // Lease and ACK arrive as separate HTTP requests, so token custody has to
  // outlive a single request. Keyed by delivery id, which is globally unique.
  const leases = new LeaseRegistry();

  app.get('/copilot/health', async () => ({ status: 'ok' }));

  /**
   * What this deployment can actually do. The UI renders from this rather than
   * assuming a tool exists — a producer-only MCP credential must not advertise
   * admin actions.
   */
  app.get('/copilot/capabilities', async () => {
    const capabilities = await mcp.capabilities();
    return {
      llm: {
        configured: hasLlmCredential(config),
        model: config.COPILOT_MODEL,
        effort: config.COPILOT_EFFORT,
      },
      mcp: capabilities,
      explorerUrl: config.EXPLORER_URL,
      mcpServerUrl: config.MCP_SERVER_URL,
      isDevelopment: config.NODE_ENV !== 'production',
    };
  });

  /** Force a fresh MCP session — the UI's "reconnect" affordance. */
  app.post('/copilot/reconnect', async () => {
    await mcp.reset();
    return { mcp: await mcp.capabilities() };
  });

  /**
   * Read-only snapshot for the live context panel, served through MCP so the
   * browser never holds a Triggers credential. Individual lookups are allowed
   * to fail independently — a stale selected id must not blank the whole panel.
   */
  app.get('/copilot/context', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>;

    const read = async (tool: string, args: Record<string, unknown>): Promise<unknown> => {
      if (!mcp.hasTool(tool)) return null;
      try {
        const outcome = await mcp.callTool(tool, args);
        return outcome.isError ? null : outcome.raw;
      } catch {
        return null;
      }
    };

    try {
      const [overview, delivery, subscription] = await Promise.all([
        read('get_overview', {}),
        query.deliveryId ? read('get_delivery', { deliveryId: query.deliveryId }) : null,
        query.subscriptionId
          ? read('get_subscription', { subscriptionId: query.subscriptionId })
          : null,
      ]);
      return reply.send({ overview, delivery, subscription });
    } catch (cause) {
      const error = toCopilotError(cause);
      return reply.status(503).send({ error: error.toJSON(config.NODE_ENV !== 'production') });
    }
  });

  /**
   * Proxy the Explorer's SSE lifecycle stream so the context panel can show
   * live transitions. This is the one read path MCP cannot serve — the protocol
   * has no streaming resource — and it is strictly visualization.
   */
  app.get('/copilot/activity', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = config.TRIGGERS_ADMIN_TOKEN ?? config.TRIGGERS_CONSUMER_TOKEN;
    if (!token) {
      return reply.status(503).send({
        error: {
          kind: 'not_configured',
          message: 'No Triggers read credential is configured, so live activity is unavailable.',
          retryable: false,
        },
      });
    }

    const controller = new AbortController();
    request.raw.on('close', () => controller.abort());

    let upstream: Response;
    try {
      upstream = await fetch(`${config.TRIGGERS_API_URL}/v1/explorer/stream`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
    } catch (cause) {
      const error = toCopilotError(cause);
      return reply.status(503).send({ error: error.toJSON(config.NODE_ENV !== 'production') });
    }

    if (!upstream.ok || !upstream.body) {
      return reply.status(502).send({
        error: { kind: 'internal', message: 'Activity stream unavailable.', retryable: true },
      });
    }

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || res.writableEnded) break;
        res.write(Buffer.from(value));
      }
    } catch {
      // Client disconnected or upstream ended; fall through to cleanup.
    } finally {
      await reader.cancel().catch(() => undefined);
      if (!res.writableEnded) res.end();
    }
  });

  app.post('/copilot/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!hasLlmCredential(config)) {
      return reply.status(503).send({
        error: {
          kind: 'not_configured',
          message:
            'No model credential is configured on the Copilot server. Set ANTHROPIC_API_KEY and restart.',
          retryable: false,
        },
      });
    }

    const parsed = chatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          kind: 'internal',
          message: 'Malformed chat request.',
          retryable: false,
        },
      });
    }

    const capabilities = await mcp.capabilities();
    const agent = new CopilotAgent(config, mcp, log, options.anthropic, leases);

    // The client aborting the fetch must actually stop model + tool work.
    const controller = new AbortController();
    const onClose = () => controller.abort();
    request.raw.on('close', onClose);

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: AgentEvent): void => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const generator = agent.run(
        {
          turns: parsed.data.turns,
          context: parsed.data.context,
          confirmations: parsed.data.confirmations,
          signal: controller.signal,
        },
        buildSystemPrompt(capabilities),
      );
      for await (const event of generator) send(event);
    } catch (cause) {
      const error = toCopilotError(cause);
      log.error({ kind: error.kind }, 'copilot chat failed');
      send({ type: 'error', error: error.toJSON(config.NODE_ENV !== 'production') });
      send({ type: 'done', stopReason: null });
    } finally {
      request.raw.removeListener('close', onClose);
      if (!res.writableEnded) res.end();
    }
  });

  // In production the backend also serves the built SPA, keeping the browser
  // same-origin with the API so no credentials cross an origin boundary.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = path.resolve(here, '../..', config.COPILOT_WEB_DIR);
  if (config.NODE_ENV === 'production') {
    void app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/copilot/')) {
        return reply.status(404).send({ error: { message: 'Not found' } });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
