import { defineConfig } from '@playwright/test'

// The cloud-rendering visual suite: `CloudRadarCanvas` against pixel-exact baselines. Local only,
// because the baselines are Windows-rendered (`bun run test:browser:visual` from the root).
export default defineConfig({
  testDir: './e2e',
  testMatch: 'cloud-rendering.spec.ts',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: 'http://localhost:3014', timezoneId: 'Europe/Helsinki', locale: 'en-US', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'bun vite --config e2e/clouds-fixture/vite.config.ts --port 3014 --strictPort',
    port: 3014,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
