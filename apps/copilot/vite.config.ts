import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The Copilot browser app talks *only* to its own backend (`/copilot/*`) — the
 * model key and the Triggers MCP credentials never reach the browser, and even
 * the read-only context panel and live activity stream are proxied by that
 * backend rather than fetched from the API directly. There is deliberately no
 * `/v1` proxy here: the browser has no business reaching the API.
 *
 * Env comes from the repository-root `.env`, matching every other app.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const copilotTarget = env.VITE_COPILOT_PROXY || 'http://127.0.0.1:3200';

  return {
    envDir: repoRoot,
    plugins: [react()],
    // pnpm's isolated node_modules can surface more than one copy of React to
    // the dev server (framer-motion / react-query link their own peer). Force one.
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['react', 'react-dom', 'react/jsx-runtime'] },
    server: {
      port: 5174,
      proxy: {
        // SSE needs buffering disabled, which Vite's proxy honours by default.
        '/copilot': { target: copilotTarget, changeOrigin: true },
      },
    },
    build: { outDir: 'dist/web', emptyOutDir: true },
  };
});
