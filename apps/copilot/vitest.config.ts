import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * One suite covers both halves of the app. Frontend tests run in jsdom by
 * default; server tests opt into node with a `@vitest-environment node`
 * docblock, so the agent and MCP-client tests never load a DOM.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
    include: ['src/**/*.test.{ts,tsx}', 'server/test/**/*.test.ts'],
  },
});
