import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('./e2e/fixture', import.meta.url)),
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('./test-dist', import.meta.url)),
    emptyOutDir: true,
  },
})
