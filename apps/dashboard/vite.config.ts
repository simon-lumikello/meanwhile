import { fileURLToPath } from 'node:url'
import { maplibreWorkerSource } from '@simon-lumikello/meanwhile-radar/vite'
import { toNodeMiddleware } from '@simon-lumikello/meanwhile-relay/node'
import { appVersion } from '@simon-lumikello/meanwhile-ui/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { createServerAircraftRelay, DASHBOARD_AIRCRAFT_RELAY_PATHS } from './server/aircraftRelay.ts'
import { CALENDAR_PROXY_PATH, createCalendarProxyHandler } from './server/calendarProxy.ts'
import { validateResolvableExternalHttpUrl } from './server/proxySecurity.node.ts'

/** Serves the calendar proxy and the aircraft relay from `vite dev` and `vite preview`, as Vercel and the self-hosted server do in production. */
function dashboardServerRoutes(): Plugin {
  const calendarProxy = toNodeMiddleware(createCalendarProxyHandler({ validate: validateResolvableExternalHttpUrl }))
  const aircraftRelay = toNodeMiddleware(createServerAircraftRelay())
  const mount = (middlewares: Connect.Server) => {
    middlewares.use(CALENDAR_PROXY_PATH, calendarProxy)
    for (const relayPath of DASHBOARD_AIRCRAFT_RELAY_PATHS) middlewares.use(relayPath, aircraftRelay)
  }
  return {
    name: 'dashboard-server-routes',
    configureServer: server => mount(server.middlewares),
    configurePreviewServer: server => mount(server.middlewares),
  }
}

export default defineConfig({
  resolve: {
    // One React and one QueryClient context, whichever workspace package imports them.
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: { '@dashboard': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [tailwindcss(), react(), appVersion(), maplibreWorkerSource(), dashboardServerRoutes()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: id => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
})
