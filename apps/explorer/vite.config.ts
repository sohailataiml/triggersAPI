import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Explorer proxies /v1 and /metrics to the API so the browser can use
// same-origin URLs. The target defaults to 127.0.0.1:3000 (IPv4 avoids the
// Windows localhost→IPv6 ambiguity); override with VITE_API_PROXY when the API
// runs on another port.
const apiTarget = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: apiTarget, changeOrigin: true },
      '/metrics': { target: apiTarget, changeOrigin: true },
    },
  },
});
