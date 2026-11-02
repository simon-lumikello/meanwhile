import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Serves the cloud renderer fixture for the visual suite (playwright.visual.config.ts).
// The renderer imports radar source directly and React from the workspace root, so the
// repository root is served.
const root = fileURLToPath(new URL('../../../..', import.meta.url))

export default defineConfig({
  root,
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { fs: { allow: [root] } },
})
