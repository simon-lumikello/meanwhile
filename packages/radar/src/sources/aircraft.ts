import { browserRadarTransport, type RadarTransport, withTimeout } from './transport'
import type { AirplaneData } from '../types'
export type { AirplaneData } from '../types'
export const STANDARD_AIRPLANE_RADIUS_NM = 75
/** The widest search the ADS-B upstream (and the relay) accepts. */
export const MAX_AIRPLANE_RADIUS_NM = 250
/**
 * Parses one upstream aircraft. `observedAtMs` is when the response was produced;
 * the aircraft's `seen_pos` (seconds since its position was received) dates the
 * position against it, so the renderer extrapolates from the real position time
 * even when the response was served from a cache.
 */
export function parseAirplaneState(state: unknown, observedAtMs = Date.now()): AirplaneData | null { const item = state as Record<string, unknown>; if (item.lat == null || item.lon == null || item.lat === '' || item.lon === '') return null; const latitude = Number(item.lat), longitude = Number(item.lon); if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null; const rawAltitude = item.alt_geom ?? item.alt_baro; const altitude = rawAltitude === 'ground' ? 0 : (Number(rawAltitude) || 0) * .3048; const categoryMatch = typeof item.category === 'string' ? item.category.match(/\d+/) : null; const category = categoryMatch ? Number(categoryMatch[0]) === 7 ? 8 : Number(categoryMatch[0]) : 0; const seenPos = typeof item.seen_pos === 'number' && Number.isFinite(item.seen_pos) ? Math.max(0, item.seen_pos) : 0; const velocity = typeof item.gs === 'number' ? item.gs * .514444 : 0; const trackRate = parseTrackRate(item, velocity); return { icao24: String(item.hex ?? ''), callsign: String(item.flight ?? '').trim(), originCountry: '', latitude, longitude, altitude, velocity, trueTrack: Number(item.track ?? item.true_heading ?? 0), ...(trackRate === undefined ? {} : { trackRate }), category, lastContact: observedAtMs / 1000 - seenPos } }

/** Faster than any airliner turns; a larger reading is noise. */
const MAX_TRACK_RATE_DEG_S = 6
/**
 * The reported rate of turn (`track_rate`, degrees per second, positive to the
 * right), or else the rate a coordinated turn at the reported bank (`roll`,
 * degrees, positive to the right) gives at this speed.
 */
function parseTrackRate(item: Record<string, unknown>, velocity: number): number | undefined {
  let rate: number | undefined
  if (typeof item.track_rate === 'number' && Number.isFinite(item.track_rate)) rate = item.track_rate
  else if (typeof item.roll === 'number' && Number.isFinite(item.roll) && Math.abs(item.roll) < 60 && velocity > 30) {
    rate = ((9.81 * Math.tan((item.roll * Math.PI) / 180)) / velocity) * (180 / Math.PI)
  }
  return rate === undefined ? undefined : Math.max(-MAX_TRACK_RATE_DEG_S, Math.min(MAX_TRACK_RATE_DEG_S, rate))
}
export interface AircraftSourceConfig { relayUrl?: string; transport?: RadarTransport; timeoutMs?: number }
/** Wide searches through a busy upstream can take several seconds; give up only well beyond that. */
const AIRCRAFT_TIMEOUT_MS = 10_000
const clampRadiusNm =(radiusNm: number) => Number.isFinite(radiusNm) ? Math.min(Math.max(Math.ceil(radiusNm), 1), MAX_AIRPLANE_RADIUS_NM) : STANDARD_AIRPLANE_RADIUS_NM

async function requestAircraft(url: URL, config: AircraftSourceConfig, signal?: AbortSignal): Promise<AirplaneData[]> {
  const response = await (config.transport ?? browserRadarTransport).fetch(url, { signal: withTimeout(signal, config.timeoutMs ?? AIRCRAFT_TIMEOUT_MS) })
  if (!response.ok) throw new AircraftRequestError(response.status)
  const payload: { ac?: unknown[]; now?: unknown } = await response.json()
  // A response time ahead of this clock would date positions in the future.
  const observedAtMs = typeof payload.now === 'number' && Number.isFinite(payload.now) ? Math.min(payload.now, Date.now()) : Date.now()
  return Array.isArray(payload.ac) ? payload.ac.map(state => parseAirplaneState(state, observedAtMs)).filter((plane: AirplaneData | null): plane is AirplaneData => plane !== null) : []
}

const relayRequestUrl = (relayUrl: string) => new URL(relayUrl, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)

/** A relay or upstream failure; `status` 429 means the upstream is throttling requests. */
export class AircraftRequestError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`Failed to fetch aircraft (${status})`)
    this.name = 'AircraftRequestError'
    this.status = status
  }
}

/** Aircraft within a radius of a point. */
export async function fetchAircraft(lat: number, lon: number, config: AircraftSourceConfig, signal?: AbortSignal, radiusNm = STANDARD_AIRPLANE_RADIUS_NM): Promise<AirplaneData[]> { if (!config.relayUrl || !Number.isFinite(lat) || !Number.isFinite(lon)) return []; const url = relayRequestUrl(config.relayUrl); url.searchParams.set('lat', String(Math.round(lat * 100) / 100)); url.searchParams.set('lon', String(Math.round(lon * 100) / 100)); url.searchParams.set('dist', String(clampRadiusNm(radiusNm))); return requestAircraft(url, config, signal) }

/**
 * Aircraft over a whole region the relay serves by name (for example `finland`),
 * as one snapshot shared by every viewer. Zooming and panning within the region
 * need no further requests.
 */
export async function fetchAircraftRegion(region: string, config: AircraftSourceConfig, signal?: AbortSignal): Promise<AirplaneData[]> {
  if (!config.relayUrl || !region) return []
  const url = relayRequestUrl(config.relayUrl)
  url.searchParams.set('region', region)
  return requestAircraft(url, config, signal)
}
