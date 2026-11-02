import { defineConfig } from '@playwright/test'

// The radar fixture (`e2e/fixture`: supplied frames and overlays, no live feeds) on its dev server.
// `playwright.production.config.ts` runs the same suite against a production build, as CI does.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'radar-interactions.spec.ts',
  timeout: 90_000,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: 'http://127.0.0.1:3004', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'bun run browser:dev -- --host 127.0.0.1 --port 3004 --strictPort',
    port: 3004,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
