import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { maplibreWorkerSource } from './src/vite'

export default defineConfig({
  plugins: [maplibreWorkerSource()],
  root: fileURLToPath(new URL('./e2e/fixture', import.meta.url)),
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('./test-dist', import.meta.url)),
    emptyOutDir: true,
  },
})
