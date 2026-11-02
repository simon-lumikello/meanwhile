/**
 * Aircraft relay endpoint for this deployment.
 *
 * ADS-B data cannot be fetched straight from the browser (the upstream API
 * sends no CORS headers), so the app talks to a same-origin relay. Deployments
 * that ship `api/adsb-proxy` (Vercel) or the bundled static server get the
 * default. Static hosts without a relay can build with an empty
 * `VITE_AIRCRAFT_RELAY_URL` to disable the aircraft overlay entirely.
 */
export const DEFAULT_AIRCRAFT_RELAY_URL = '/api/adsb-proxy'

/** The relay region the app polls (`?region=finland`); served by `server/aircraftRelay.ts`. */
export const AIRCRAFT_REGION = 'finland'

export function resolveAircraftRelayUrl(configured: string | undefined = import.meta.env.VITE_AIRCRAFT_RELAY_URL): string | undefined {
  if (configured === undefined) return DEFAULT_AIRCRAFT_RELAY_URL
  const trimmed = configured.trim()
  return trimmed ? trimmed : undefined
}

export const AIRCRAFT_RELAY_URL = resolveAircraftRelayUrl()
export const HAS_AIRCRAFT_RELAY = Boolean(AIRCRAFT_RELAY_URL)
