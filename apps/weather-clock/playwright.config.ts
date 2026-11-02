import { defineConfig } from '@playwright/test'

// Runs against the production build served by `vite preview`. The tall viewport
// keeps the optional radar card on screen (it hides on short displays).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: 'http://127.0.0.1:3011',
    viewport: { width: 1024, height: 1400 },
    timezoneId: 'Europe/Helsinki',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run preview -- --host 127.0.0.1 --port 3011 --strictPort',
    port: 3011,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
