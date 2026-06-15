import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    globalSetup: ['./test-helpers/setup.js'],
    // `data-reconstruction/` holds the git-ignored one-shot migration
    // tooling for Story 03 Phase A. Its tests use `node:assert` and
    // are run directly via `node ...` — they are not part of the
    // committed test suite.
    exclude: [...configDefaults.exclude, 'data-reconstruction/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        ...configDefaults.exclude,
        '.public',
        'coverage',
        'postcss.config.js',
        'stylelint.config.js',
        'vitest.config.js',
        '.sonarlint',
        'babel.config.cjs'
      ]
    }
  }
})
