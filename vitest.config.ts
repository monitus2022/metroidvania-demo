import { defineConfig } from 'vitest/config'

// Unit tests only cover the pure sim. It has no DOM dependency by design,
// so `environment: 'node'` is correct and makes the tests fast.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
