import { defineConfig } from '@playwright/test'

// The functional suite runs against the production build (`vite preview`), so it also covers
// build, minification, and asset-path regressions; `bun run test:dashboard:e2e` builds first. Every
// test seeds its own config into a fresh browser context, freezes the clock, and mocks every network
// request, so the suite runs fully in parallel.
export default defineConfig({
  testDir: './e2e',
  testIgnore: 'ambient-controller.spec.ts',
  timeout: 90_000,
  fullyParallel: true,
  workers: process.env.CI ? 4 : '50%',
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: 'http://127.0.0.1:3010',
    timezoneId: 'Europe/Helsinki',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run preview -- --host 127.0.0.1 --port 3010 --strictPort',
    port: 3010,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
