import { buildApp } from './app.js';
import { loadCopilotConfig, hasLlmCredential } from './config.js';

/**
 * Copilot backend entrypoint. Holds the model credential and the Triggers MCP
 * role tokens; the browser talks only to this process.
 */
async function main(): Promise<void> {
  const config = loadCopilotConfig();
  const app = buildApp(config);

  await app.listen({ host: config.COPILOT_HOST, port: config.COPILOT_PORT });

  app.log.info(
    {
      mcpServerUrl: config.MCP_SERVER_URL,
      model: config.COPILOT_MODEL,
      effort: config.COPILOT_EFFORT,
      llmConfigured: hasLlmCredential(config),
    },
    'Zapier AI Automation Copilot backend ready',
  );

  if (!hasLlmCredential(config)) {
    app.log.warn(
      'ANTHROPIC_API_KEY is not set — the Copilot will serve its setup screen instead of running the agent.',
    );
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Copilot backend failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
