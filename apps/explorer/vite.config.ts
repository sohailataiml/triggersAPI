import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Every other app in this monorepo reads the repository-root `.env`. Point Vite
 * at it too, so `pnpm demo:setup` can write the demo tokens in one place and the
 * Explorer auto-connects without anyone opening Settings.
 *
 * Vite still only injects `VITE_`-prefixed variables into the bundle, so the
 * server-side secrets living in the same file (the model key, the MCP tokens)
 * are not exposed by this. The `VITE_DEMO_*` tokens are — that is the Explorer's
 * pre-existing demo model, since it is a static SPA that calls the API directly.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');

  // The Explorer proxies /v1 and /metrics to the API so the browser can use
  // same-origin URLs. IPv4 default avoids the Windows localhost→IPv6 ambiguity;
  // override with VITE_API_PROXY when the API runs on another port.
  const apiTarget = env.VITE_API_PROXY || 'http://127.0.0.1:3000';

  return {
    envDir: repoRoot,
    plugins: [react()],
    // pnpm's isolated node_modules can surface more than one copy of React to
    // the dev server (framer-motion / react-query pull their own peer link),
    // which triggers "Invalid hook call". Force a single copy.
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    server: {
      port: 5173,
      proxy: {
        '/v1': { target: apiTarget, changeOrigin: true },
        '/metrics': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
