/**
 * The dashboard's aircraft relay, configured once and served by every
 * dashboard runtime: the Vercel edge function (`api/adsb-proxy.ts`), the Vite
 * dev server, and the self-hosted server (`server/index.ts`).
 */

// The relay library by its source path, not `@simon-lumikello/meanwhile-relay/aircraft`: Vercel bundles
// the edge function and compiles TypeScript only along relative imports from TypeScript;
// TypeScript reached through a package in node_modules (or from a .js file) is an "unsupported
// module" there. Node also loads this file directly (from the Vite config), so imports keep their
// `.ts` extension and the file uses only erasable TypeScript syntax.
import { createAircraftRelayHandler, FINLAND_AIRSPACE, type AircraftRegion, type RelayHandler } from '../../../packages/relay/src/aircraft.ts'

export const DASHBOARD_RELAY_USER_AGENT = 'Meanwhile-Dashboard/1.0 (simon-lumikello)'

/** Paths the dashboard serves the relay on; the second is kept for older clients. */
export const DASHBOARD_AIRCRAFT_RELAY_PATHS: readonly string[] = ['/api/adsb-proxy', '/api/opensky-proxy']

/**
 * The dashboard polls one snapshot of Finland (`?region=finland`), shared by
 * every viewer, instead of searching around each map view.
 */
export const DASHBOARD_AIRCRAFT_REGIONS: Readonly<Record<string, AircraftRegion>> = { finland: FINLAND_AIRSPACE }

const RELAY_CACHE = { freshMs: 25_000, staleFallbackMs: 10 * 60 * 1000 }

/**
 * The CDN keeps the Finland snapshot for a minute. Every expiry is one relay run
 * with two country-wide upstream searches, and the shorter default made that
 * refresh most of the dashboard's Vercel Active CPU.
 */
const REGION_CACHE_SECONDS = 60

/**
 * Handler for edge runtimes. The CDN does the main caching; the in-process cache
 * lives only as long as a warm instance, but then covers for a throttled upstream
 * (shared edge IPs are throttled often).
 */
export const edgeAircraftRelay: RelayHandler = createAircraftRelayHandler({
  userAgent: DASHBOARD_RELAY_USER_AGENT,
  regions: DASHBOARD_AIRCRAFT_REGIONS,
  regionCacheSeconds: REGION_CACHE_SECONDS,
  cache: RELAY_CACHE,
})

/** Handler with an in-process cache and stale fallback, for long-running servers. */
export function createServerAircraftRelay(): RelayHandler {
  return createAircraftRelayHandler({
    userAgent: DASHBOARD_RELAY_USER_AGENT,
    regions: DASHBOARD_AIRCRAFT_REGIONS,
    cache: RELAY_CACHE,
  })
}
