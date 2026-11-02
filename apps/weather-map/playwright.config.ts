import { defineConfig } from '@playwright/test'

// Runs against the production build served by `vite preview`, which also serves the aircraft relay.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: 'http://127.0.0.1:3012',
    timezoneId: 'Europe/Helsinki',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run preview -- --host 127.0.0.1 --port 3012 --strictPort',
    port: 3012,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
