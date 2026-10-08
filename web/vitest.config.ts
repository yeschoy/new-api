import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    // Form tests that type with user-event slow down when the whole suite runs in parallel; 5s is too tight there.
    testTimeout: 15_000,
  },
})
