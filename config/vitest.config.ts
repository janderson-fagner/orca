import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      // Why: mobile/ owns its own bundle but pure-logic units (no React
      // Native imports) can run under the root vitest harness so they
      // get covered in CI alongside src/ tests.
      'mobile/src/**/*.test.ts'
    ]
  }
})
