/**
 * Same-origin relay for live ADS-B aircraft positions.
 *
 * Browsers cannot call the ADS-B upstream directly because it sends no CORS
 * headers, so each application serves this handler on its own origin. The
 * handler speaks the standard `Request` → `Response` contract and runs unchanged
 * on edge runtimes, Bun, and Node 18+ (see `./node` for Node middleware).
 */

export { FINLAND_AIRSPACE } from './finlandAirspace.ts'

export const AIRCRAFT_UPSTREAM_ORIGIN = 'https://api.adsb.lol'
export const DEFAULT_AIRCRAFT_RADIUS_NM = 75
export const MAX_AIRCRAFT_RADIUS_NM = 250

export interface AircraftQuery {
  /** Latitude, normalised to four decimals. */
  lat: string
  /** Longitude, normalised to four decimals. */
  lon: string
  /** Search radius in nautical miles. */
  dist: string
}

export interface AircraftRelayCacheOptions {
  /** Serve a cached response without contacting the upstream for this long. */
  freshMs: number
  /** When the upstream fails, serve a cached response up to this old. */
  staleFallbackMs: number
  /** Bound on remembered locations; the oldest entry is evicted first. */
  maxEntries?: number
}

export interface AircraftRelayOptions {
  /** Identifies the product to the upstream, e.g. `MapLumikello/1.0 (contact)`. */
  userAgent: string
  /** Upper bound for the requested radius. Defaults to {@link MAX_AIRCRAFT_RADIUS_NM}. */
  maxRadiusNm?: number
  /**
   * Fixed airspaces served by name (`?region=<name>`), e.g. `{ finland: FINLAND_AIRSPACE }`.
   * Every client of a region shares one snapshot, so the upstream sees the same
   * few requests however many viewers there are and however they move their maps.
   */
  regions?: Readonly<Record<string, AircraftRegion>>
  /**
   * How long the CDN keeps a region snapshot, in seconds (default 25). Every
   * expiry costs one upstream refresh, so a longer time trades position
   * freshness for fewer relay runs.
   */
  regionCacheSeconds?: number
  /**
   * Pause between a region's upstream searches, in milliseconds (default 1000).
   * A throttled search is retried once after twice this pause.
   */
  searchSpacingMs?: number
  /**
   * In-process response cache for long-running servers. Leave unset on edge
   * runtimes, where the `Cache-Control` headers let the CDN do this job.
   */
  cache?: AircraftRelayCacheOptions
  /** Transport override for tests. */
  fetch?: typeof fetch
}

/** One circle the upstream answers directly. */
export interface AircraftSearch {
  lat: number
  lon: number
  /** Radius in nautical miles, clamped to the relay's maximum. */
  radiusNm: number
}

/** A fixed airspace, served as one merged snapshot. */
export interface AircraftRegion {
  /** Circles whose union covers the outline; each is one upstream request per refresh. */
  searches: readonly AircraftSearch[]
  /** Boundary as `[latitude, longitude]` vertices; aircraft outside it are dropped. */
  outline: readonly (readonly [number, number])[]
}

/** A region response: upstream time in epoch milliseconds and the aircraft inside the outline. */
export interface AircraftSnapshot {
  now: number
  ac: Record<string, unknown>[]
}

export type RelayHandler = (request: Request) => Promise<Response>

const FRESH_CACHE_CONTROL = 'public, max-age=25, s-maxage=25, stale-while-revalidate=60'
const ERROR_CACHE_CONTROL = 'public, max-age=10, stale-while-revalidate=30'
/**
 * Region snapshots are shared by every viewer, who poll every 30 seconds; by
 * default the CDN keeps one a little less than that, so each poll gets a new one
 * while viewers polling at the same time share a single relay call.
 */
const DEFAULT_REGION_CACHE_SECONDS = 25
const regionCacheControl = (seconds: number) => `public, max-age=${Math.max(seconds - 5, 0)}, s-maxage=${seconds}, stale-while-revalidate=30`
/** A throttled upstream is left alone for a while rather than asked again by every viewer. */
const REGION_ERROR_CACHE_CONTROL = 'public, max-age=30, s-maxage=30'
/** The fields the radar renderer reads; everything else is dropped to keep snapshots small. */
const SNAPSHOT_FIELDS = ['hex', 'flight', 'lat', 'lon', 'alt_baro', 'alt_geom', 'gs', 'track', 'track_rate', 'roll', 'true_heading', 'category']

/**
 * Resolves the upstream query from request parameters, accepting the current
 * `lat`/`lon`/`dist` form and the legacy OpenSky bounding box
 * (`lamin`/`lamax`/`lomin`/`lomax`). Returns `null` for missing or invalid
 * coordinates. Values are normalised to numbers before they reach the upstream
 * URL, so request input can never alter its path.
 */
export function resolveAircraftQuery(searchParams: URLSearchParams, maxRadiusNm = MAX_AIRCRAFT_RADIUS_NM): AircraftQuery | null {
  let lat = parseCoordinate(searchParams.get('lat'))
  let lon = parseCoordinate(searchParams.get('lon'))

  if ((lat === null || lon === null) && searchParams.has('lamin')) {
    const lamin = parseCoordinate(searchParams.get('lamin'))
    const lamax = parseCoordinate(searchParams.get('lamax'))
    const lomin = parseCoordinate(searchParams.get('lomin'))
    const lomax = parseCoordinate(searchParams.get('lomax'))
    if (lamin === null || lamax === null || lomin === null || lomax === null) return null
    lat = (lamin + lamax) / 2
    lon = (lomin + lomax) / 2
  }

  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null

  const requested = Number(searchParams.get('dist') ?? DEFAULT_AIRCRAFT_RADIUS_NM)
  const dist = Number.isFinite(requested) ? Math.min(Math.max(Math.round(requested), 1), maxRadiusNm) : DEFAULT_AIRCRAFT_RADIUS_NM

  return { lat: lat.toFixed(4), lon: lon.toFixed(4), dist: String(dist) }
}

export function aircraftUpstreamUrl({ lat, lon, dist }: AircraftQuery): string {
  return `${AIRCRAFT_UPSTREAM_ORIGIN}/v2/lat/${lat}/lon/${lon}/dist/${dist}`
}

/** Creates the relay handler. Each call owns an independent cache. */
export function createAircraftRelayHandler(options: AircraftRelayOptions): RelayHandler {
  if (!options.userAgent.trim()) throw new Error('createAircraftRelayHandler: userAgent is required')
  const transport = options.fetch ?? fetch
  const maxRadiusNm = options.maxRadiusNm ?? MAX_AIRCRAFT_RADIUS_NM
  const cache = options.cache ? new ResponseCache(options.cache) : null
  const searchSpacingMs = options.searchSpacingMs ?? 1_000
  const regionCacheSeconds = Math.max(Math.round(options.regionCacheSeconds ?? DEFAULT_REGION_CACHE_SECONDS), 1)
  const regionCacheHeader = regionCacheControl(regionCacheSeconds)

  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'Method not allowed', ac: [] }, 405, { Allow: 'GET, HEAD' })
    }

    const searchParams = new URL(request.url).searchParams
    const regionName = searchParams.get('region')
    if (regionName !== null) return serveRegion(regionName)

    const query = resolveAircraftQuery(searchParams, maxRadiusNm)
    if (!query) return json({ error: 'Missing or invalid lat/lon parameters', ac: [] }, 400)

    const key = cacheKey(query)
    const cached = cache?.fresh(key)
    if (cached !== undefined) return body(cached, 200, { 'Cache-Control': FRESH_CACHE_CONTROL, 'X-Cache': 'HIT' })

    try {
      const upstream = await transport(aircraftUpstreamUrl(query), { headers: { 'User-Agent': options.userAgent } })
      if (upstream.ok) {
        const text = await upstream.text()
        cache?.set(key, text)
        return body(text, 200, { 'Cache-Control': FRESH_CACHE_CONTROL, ...(cache ? { 'X-Cache': 'MISS' } : {}) })
      }
      const stale = cache?.stale(key)
      if (stale !== undefined) return body(stale, 200, { 'X-Cache': 'STALE-FALLBACK' })
      return json({ error: `Upstream returned status ${upstream.status}`, ac: [] }, upstream.status, { 'Cache-Control': ERROR_CACHE_CONTROL })
    } catch (error: unknown) {
      const stale = cache?.stale(key)
      if (stale !== undefined) return body(stale, 200, { 'X-Cache': 'STALE-FALLBACK' })
      return json({ error: error instanceof Error ? error.message : 'Failed to fetch aircraft', ac: [] }, 502)
    }
  }

  async function serveRegion(name: string): Promise<Response> {
    const region = options.regions && Object.hasOwn(options.regions, name) ? options.regions[name] : undefined
    if (!region) return json({ error: 'Unknown region', ac: [] }, 400)

    const key = `region:${name}`
    const cached = cache?.fresh(key)
    if (cached !== undefined) return body(cached, 200, { 'Cache-Control': regionCacheHeader, 'X-Cache': 'HIT' })
    const staleOr = (failure: () => Response) => {
      const stale = cache?.stale(key)
      return stale !== undefined ? body(stale, 200, { 'X-Cache': 'STALE-FALLBACK' }) : failure()
    }

    try {
      const headers = { 'User-Agent': options.userAgent }
      const payloads: unknown[] = []
      // Sequential on purpose: the upstream throttles bursts, even two simultaneous requests.
      for (const [index, search] of region.searches.entries()) {
        if (index > 0) await sleep(searchSpacingMs)
        const url = aircraftUpstreamUrl(searchQuery(search, maxRadiusNm))
        let response = await transport(url, { headers })
        if (THROTTLED_STATUSES.has(response.status)) {
          discard(response)
          await sleep(searchSpacingMs * 2)
          response = await transport(url, { headers })
        }
        if (!response.ok) {
          discard(response)
          // Every throttling status reads as 429, so clients back off the same way.
          const status = THROTTLED_STATUSES.has(response.status) ? 429 : response.status
          return staleOr(() => json({ error: `Upstream returned status ${response.status}`, ac: [] }, status, { 'Cache-Control': REGION_ERROR_CACHE_CONTROL }))
        }
        payloads.push(await response.json())
      }
      const text = JSON.stringify(mergeRegionSnapshots(region, payloads, Date.now()))
      cache?.set(key, text)
      return body(text, 200, { 'Cache-Control': regionCacheHeader, ...(cache ? { 'X-Cache': 'MISS' } : {}) })
    } catch (error: unknown) {
      return staleOr(() => json({ error: error instanceof Error ? error.message : 'Failed to fetch aircraft', ac: [] }, 502))
    }
  }
}

/**
 * Merges upstream search responses into one region snapshot: aircraft outside
 * the outline are dropped, an aircraft seen by several overlapping searches is
 * kept once (its freshest position), and each position's age (`seen_pos`, in
 * seconds) is restated against the snapshot's `now`.
 */
export function mergeRegionSnapshots(region: AircraftRegion, payloads: readonly unknown[], fallbackNow: number): AircraftSnapshot {
  const snapshots = payloads.map(payload => {
    const record = isRecord(payload) ? payload : {}
    return { now: finiteNumber(record.now) ?? fallbackNow, ac: Array.isArray(record.ac) ? record.ac : [] }
  })
  const now = snapshots.length ? Math.max(...snapshots.map(snapshot => snapshot.now)) : fallbackNow
  const merged = new Map<string, { age: number; aircraft: Record<string, unknown> }>()

  for (const snapshot of snapshots) {
    for (const item of snapshot.ac) {
      if (!isRecord(item)) continue
      const lat = finiteNumber(item.lat)
      const lon = finiteNumber(item.lon)
      if (lat === undefined || lon === undefined || !isInsideOutline(region.outline, lat, lon)) continue
      const age = Math.max(0, finiteNumber(item.seen_pos) ?? finiteNumber(item.seen) ?? 0) + (now - snapshot.now) / 1000
      const key = typeof item.hex === 'string' && item.hex ? item.hex : `#${merged.size}`
      const existing = merged.get(key)
      if (existing && existing.age <= age) continue
      const aircraft: Record<string, unknown> = {}
      for (const field of SNAPSHOT_FIELDS) if (item[field] !== undefined) aircraft[field] = item[field]
      aircraft.seen_pos = Math.round(age * 10) / 10
      merged.set(key, { age, aircraft })
    }
  }

  return { now, ac: [...merged.values()].map(entry => entry.aircraft) }
}

/** Even-odd test of a point against a `[latitude, longitude]` outline. */
export function isInsideOutline(outline: AircraftRegion['outline'], lat: number, lon: number): boolean {
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [latI, lonI] = outline[i]
    const [latJ, lonJ] = outline[j]
    if ((latI > lat) !== (latJ > lat) && lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI) inside = !inside
  }
  return inside
}

/** The upstream answers bursts with 429, and sometimes with 420. */
const THROTTLED_STATUSES = new Set([420, 429])

const sleep = (ms: number) => ms > 0 ? new Promise<void>(resolve => setTimeout(resolve, ms)) : Promise.resolve()

function discard(response: Response): void {
  void response.body?.cancel().catch(() => undefined)
}

function searchQuery({ lat, lon, radiusNm }: AircraftSearch, maxRadiusNm: number): AircraftQuery {
  return { lat: lat.toFixed(4), lon: lon.toFixed(4), dist: String(Math.min(Math.max(Math.round(radiusNm), 1), maxRadiusNm)) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseCoordinate(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** Nearby requests share an entry: two decimals is roughly one kilometre. */
function cacheKey({ lat, lon, dist }: AircraftQuery): string {
  return `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}_${dist}`
}

function body(text: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers },
  })
}

function json(payload: unknown, status: number, headers: Record<string, string> = {}): Response {
  return body(JSON.stringify(payload), status, headers)
}

class ResponseCache {
  private readonly entries = new Map<string, { timestamp: number; body: string }>()
  private readonly options: Required<AircraftRelayCacheOptions>

  constructor(options: AircraftRelayCacheOptions) {
    this.options = { maxEntries: 256, ...options }
  }

  fresh(key: string): string | undefined {
    return this.within(key, this.options.freshMs)
  }

  stale(key: string): string | undefined {
    return this.within(key, this.options.staleFallbackMs)
  }

  set(key: string, body: string): void {
    this.entries.delete(key)
    this.entries.set(key, { timestamp: Date.now(), body })
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  private within(key: string, ageMs: number): string | undefined {
    const entry = this.entries.get(key)
    return entry && Date.now() - entry.timestamp < ageMs ? entry.body : undefined
  }
}
