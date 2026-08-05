import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration tests share Postgres/Redis; run files sequentially to avoid
    // cross-file interference from database truncation.
    fileParallelism: false,
  },
});
