// The relay library by its source path: Vercel compiles an edge function's TypeScript only along
// relative imports from TypeScript, so the package name would be an "unsupported module" there.
import { createAircraftRelayHandler, FINLAND_AIRSPACE } from '../../../packages/relay/src/aircraft.ts'

/**
 * The app's same-origin aircraft relay (`/api/adsb-proxy`), configured once for
 * the Vercel edge function and the Vite dev/preview servers.
 */
export const AIRCRAFT_RELAY_PATH = '/api/adsb-proxy'
export const RADAR_RELAY_USER_AGENT = 'Meanwhile-Map/1.0 (simon-lumikello)'

/** The region the app polls: one snapshot of Finland (`?region=finland`), shared by every viewer. */
export const RADAR_AIRCRAFT_REGION = 'finland'
export const RADAR_AIRCRAFT_REGIONS = { [RADAR_AIRCRAFT_REGION]: FINLAND_AIRSPACE }

const RELAY_CACHE = { freshMs: 12_000, staleFallbackMs: 10 * 60 * 1000 }

/**
 * Handler for the edge. The CDN does the main caching; the in-process cache lives
 * only as long as a warm instance, but then covers for a throttled upstream
 * (shared edge IPs are throttled often).
 */
export const edgeAircraftRelay = createAircraftRelayHandler({ userAgent: RADAR_RELAY_USER_AGENT, regions: RADAR_AIRCRAFT_REGIONS, cache: RELAY_CACHE })

/** Handler with an in-process cache and stale fallback, for long-running servers. */
export function createServerAircraftRelay() {
  return createAircraftRelayHandler({ userAgent: RADAR_RELAY_USER_AGENT, regions: RADAR_AIRCRAFT_REGIONS, cache: RELAY_CACHE })
}
