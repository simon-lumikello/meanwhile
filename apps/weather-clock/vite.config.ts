import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { maplibreWorkerSource } from '@simon-lumikello/meanwhile-radar/vite'
import { appVersion } from '@simon-lumikello/meanwhile-ui/vite'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [tailwindcss(), react(), maplibreWorkerSource(), appVersion()], build: { outDir: 'dist' } })
