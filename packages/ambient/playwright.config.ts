import { defineConfig } from '@playwright/test'

// The ambient fixture (`e2e/fixture`: deterministic forecasts, no live feeds) on its dev server.
// `playwright.production.config.ts` runs the same suite against a production build, as CI does.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: 'http://127.0.0.1:3006', viewport: { width: 1024, height: 1400 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'bun run browser:dev -- --host 127.0.0.1 --port 3006 --strictPort',
    port: 3006,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
