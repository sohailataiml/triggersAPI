#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLogger } from '@triggers/observability';
import { loadMcpConfig } from './config.js';
import { createServer } from './server.js';
import { availableRoles, tokensFromConfig } from './tokens.js';

/**
 * stdio entrypoint — launched as a child process by an MCP client
 * (Claude Code, Claude Desktop, or any other host).
 *
 * stdout carries the JSON-RPC stream, so every log line must go to stderr.
 */
async function main(): Promise<void> {
  const config = loadMcpConfig();
  const log = createLogger({
    level: config.LOG_LEVEL,
    name: 'triggers-mcp',
    toStderr: true,
  });

  const tokens = tokensFromConfig(config);
  const roles = availableRoles(tokens);

  const server = createServer({
    baseUrl: config.TRIGGERS_API_URL,
    tokens,
    timeoutMs: config.TRIGGERS_REQUEST_TIMEOUT_MS,
    enableReset: config.TRIGGERS_MCP_ENABLE_RESET,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info(
    { apiUrl: config.TRIGGERS_API_URL, roles },
    'triggers MCP server ready on stdio transport',
  );

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  // The logger may not exist yet if config validation failed.
  process.stderr.write(
    `triggers MCP server failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
