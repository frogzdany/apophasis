// Vitest config for the live tool-validation suite (tests/tools/*).
// Separate from vitest.config.ts so `bun run test` stays fast and
// network-free; this one is opt-in via `bun run test:tools` and bills
// real upstreams.

import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/tools/**/*.test.ts'],
    setupFiles: ['./tests/helpers/setupFile.ts'],
    globalSetup: ['./tests/helpers/globalSetup.ts'],
    // Real network calls — be patient with slow upstreams.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Run tools sequentially so we don't slam SerpApi with parallel calls
    // and so the proxy-cache is populated predictably across files.
    fileParallelism: false,
  },
})
