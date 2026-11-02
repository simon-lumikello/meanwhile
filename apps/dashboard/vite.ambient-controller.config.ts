import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { maplibreWorkerSource } from '@simon-lumikello/meanwhile-radar/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('./e2e/ambient-controller-fixture', import.meta.url)),
  publicDir: false,
  plugins: [react(), maplibreWorkerSource()],
})
