import { defineConfig } from 'vitest/config'

// Unit tests only cover the pure sim. It has no DOM dependency by design,
// so `environment: 'node'` is correct and makes the tests fast.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // The fuzzer runs 25k random input streams (~13s of real stepping) and the
    // anchor test measures movement by search. Vitest's 5s default sits exactly
    // on the boundary and produces flaky timeouts that look like failures.
    testTimeout: 60_000,
  },
})
