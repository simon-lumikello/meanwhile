import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { toNodeMiddleware } from '@simon-lumikello/meanwhile-relay/node'
import { maplibreWorkerSource } from '@simon-lumikello/meanwhile-radar/vite'
import { appVersion } from '@simon-lumikello/meanwhile-ui/vite'
import { defineConfig, type Plugin } from 'vite'
import { AIRCRAFT_RELAY_PATH, createServerAircraftRelay } from './server/aircraftRelay.ts'

/** Serves the app's aircraft relay from `vite dev` and `vite preview`, as Vercel does in production. */
function aircraftRelay(): Plugin {
  const relay = toNodeMiddleware(createServerAircraftRelay())
  return {
    name: 'aircraft-relay',
    configureServer: server => { server.middlewares.use(AIRCRAFT_RELAY_PATH, relay) },
    configurePreviewServer: server => { server.middlewares.use(AIRCRAFT_RELAY_PATH, relay) },
  }
}

export default defineConfig({ plugins: [tailwindcss(), react(), maplibreWorkerSource(), aircraftRelay(), appVersion()], build: { outDir: 'dist' } })
