import { defineConfig } from '@playwright/test'

// The dashboard's ambient controller (night dimming, wake listeners, rollover) against a fixture
// page that renders only the controller. Slow, so it runs nightly rather than on every pull request.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'ambient-controller.spec.ts',
  timeout: 90_000,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: 'http://127.0.0.1:3013', timezoneId: 'Europe/Helsinki', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'bun vite --config vite.ambient-controller.config.ts --host 127.0.0.1 --port 3013 --strictPort',
    port: 3013,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
