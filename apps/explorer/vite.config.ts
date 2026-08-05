import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Explorer talks to the API at http://localhost:3000 by default.
// In dev, /v1 and /metrics are proxied so the browser can use same-origin URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://localhost:3000', changeOrigin: true },
      '/metrics': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
