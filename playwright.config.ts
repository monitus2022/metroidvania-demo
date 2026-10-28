import { defineConfig, devices } from '@playwright/test'

// E2E drives the *built* bundle served by `vite preview`, not the dev server,
// so the artifact under test is the artifact that ships.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 800, height: 600 },
    screenshot: 'only-on-failure',
  },
  outputDir: './artifacts/test-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
