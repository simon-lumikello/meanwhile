import { defineConfig } from '@playwright/test'
import base from './playwright.config.ts'

// The ambient fixture's production build (`bun run browser:build` first), served by `vite preview`.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:3007' },
  webServer: { ...base.webServer, command: 'bun run browser:preview -- --host 127.0.0.1 --port 3007 --strictPort', port: 3007 },
})
