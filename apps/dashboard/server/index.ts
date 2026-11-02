/**
 * The self-hosted server: serves the built dashboard (with a single-page-app fallback), the
 * calendar proxy, and the aircraft relay, all on one port.
 *
 * The Docker image runs a single dependency-free bundle of this file, produced by
 * `bun run build:server`. Requires Node.js 18+ (native fetch).
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { toNodeMiddleware } from '@simon-lumikello/meanwhile-relay/node'
import { createServerAircraftRelay, DASHBOARD_AIRCRAFT_RELAY_PATHS } from './aircraftRelay.ts'
import { CALENDAR_PROXY_PATH, createCalendarProxyHandler } from './calendarProxy.ts'
import { validateResolvableExternalHttpUrl } from './proxySecurity.node.ts'
import { resolveStaticFile, staticHeaders } from './staticFiles.ts'

const PORT = Number(process.env.PORT) || 3000
/** The built app sits beside the bundled server (`/app/dist` in the image). */
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')

const calendarProxy = toNodeMiddleware(createCalendarProxyHandler({ validate: validateResolvableExternalHttpUrl }))
const aircraftRelay = toNodeMiddleware(createServerAircraftRelay())

function serveStatic(pathname: string, response: http.ServerResponse) {
  const filePath = resolveStaticFile(DIST, pathname)
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    response.writeHead(200, staticHeaders(filePath))
    response.end(data)
  })
}

http
  .createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost')
    // Both middlewares answer errors themselves (as a JSON 500).
    if (pathname === CALENDAR_PROXY_PATH) void calendarProxy(request, response)
    else if (DASHBOARD_AIRCRAFT_RELAY_PATHS.includes(pathname)) void aircraftRelay(request, response)
    else serveStatic(pathname, response)
  })
  .listen(PORT, '0.0.0.0', () => console.log(`Meanwhile listening on http://0.0.0.0:${PORT}`))
