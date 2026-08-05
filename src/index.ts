import { createApp } from './server.js';
import { env } from './config/env.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.info(`Triggers API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown so in-flight requests can finish on SIGTERM/SIGINT.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.info(`Received ${signal}, shutting down...`);
    server.close(() => process.exit(0));
  });
}
