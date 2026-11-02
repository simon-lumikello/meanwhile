import { describe, expect, setSystemTime, test } from 'bun:test'
import { aircraftUpstreamUrl, createAircraftRelayHandler, FINLAND_AIRSPACE, isInsideOutline, resolveAircraftQuery, type AircraftRelayOptions } from '../src/aircraft'

const query = (search: string) => resolveAircraftQuery(new URLSearchParams(search))
const request = (search: string, init?: RequestInit) => new Request(`https://relay.test/api/adsb-proxy?${search}`, init)
const PAYLOAD = JSON.stringify({ ac: [{ hex: 'abc123', flight: 'FIN1', lat: 60.2, lon: 24.9 }] })

function upstream(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; userAgent: string | null }> = []
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), userAgent: new Headers(init?.headers).get('User-Agent') })
    const next = responses.shift()
    if (!next) throw new Error('unexpected upstream call')
    if (next instanceof Error) throw next
    return next
  }) as typeof fetch
  return { calls, fetch: fetchStub }
}

function relay(responses: Array<Response | Error>, options: Partial<AircraftRelayOptions> = {}) {
  const stub = upstream(responses)
  return { ...stub, handler: createAircraftRelayHandler({ userAgent: 'RelayTest/1.0', fetch: stub.fetch, ...options }) }
}

describe('resolveAircraftQuery', () => {
  test('normalises coordinates and clamps the radius', () => {
    expect(query('lat=60.1695&lon=24.9354')).toEqual({ lat: '60.1695', lon: '24.9354', dist: '75' })
    expect(query('lat=60.17&lon=24.94&dist=10')?.dist).toBe('10')
    expect(query('lat=60.17&lon=24.94&dist=9000')?.dist).toBe('250')
    expect(query('lat=60.17&lon=24.94&dist=0')?.dist).toBe('1')
    expect(query('lat=60.17&lon=24.94&dist=abc')?.dist).toBe('75')
    expect(resolveAircraftQuery(new URLSearchParams('lat=60.17&lon=24.94&dist=200'), 100)?.dist).toBe('100')
  })

  test('keeps the legacy OpenSky bounding box form', () => {
    expect(query('lamin=59&lamax=61&lomin=24&lomax=26')).toEqual({ lat: '60.0000', lon: '25.0000', dist: '75' })
    expect(query('lamin=59&lamax=61&lomin=24')).toBeNull()
  })

  test('rejects missing, out-of-range, and non-numeric coordinates', () => {
    for (const search of ['', 'lat=60.17', 'lat=&lon=24.94', 'lat=120&lon=24.94', 'lat=60.17&lon=200', 'lat=nope&lon=24.94', 'lat=../../x&lon=1']) {
      expect(query(search)).toBeNull()
    }
  })

  test('builds an https upstream URL from normalised numbers only', () => {
    const url = new URL(aircraftUpstreamUrl({ lat: '60.1695', lon: '24.9354', dist: '75' }))
    expect(url.origin).toBe('https://api.adsb.lol')
    expect(url.pathname).toBe('/v2/lat/60.1695/lon/24.9354/dist/75')
  })
})

describe('FINLAND_AIRSPACE', () => {
  const inside = (lat: number, lon: number) => isInsideOutline(FINLAND_AIRSPACE.outline, lat, lon)

  test('contains Finnish places and waters, and not the neighbours', () => {
    const finnish: Array<[number, number]> = [
      [60.17, 24.94], [60.1, 19.94], [59.9, 23.1], [60.45, 22.27], [61.5, 23.76], [62.24, 25.75], [62.6, 29.76], [63.1, 21.6],
      [65.01, 25.47], [66.5, 25.73], [68.66, 27.55], [69.05, 20.79], [69.75, 27.0], [64.8, 24.2], [60.5, 27.2],
    ]
    const foreign: Array<[number, number]> = [
      [59.33, 18.07], [59.44, 24.75], [59.94, 30.31], [60.71, 28.75], [63.83, 20.26], [65.58, 22.15], [69.01, 23.04],
      [69.47, 25.51], [69.73, 30.05], [67.86, 20.23], [61.79, 34.35], [58.38, 26.72],
    ]
    for (const [lat, lon] of finnish) expect([lat, lon, inside(lat, lon)]).toEqual([lat, lon, true])
    for (const [lat, lon] of foreign) expect([lat, lon, inside(lat, lon)]).toEqual([lat, lon, false])
  })

  test('its searches cover the whole outline', () => {
    const distanceNm = (aLat: number, aLon: number, bLat: number, bLon: number) => {
      const rad = Math.PI / 180
      const h = Math.sin(((bLat - aLat) * rad) / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLon - aLon) * rad) / 2) ** 2
      return (2 * 6371 * Math.asin(Math.sqrt(h))) / 1.852
    }
    const outline = FINLAND_AIRSPACE.outline
    for (let i = 0; i < outline.length; i++) {
      const [aLat, aLon] = outline[i]
      const [bLat, bLon] = outline[(i + 1) % outline.length]
      for (let step = 0; step <= 10; step++) {
        const lat = aLat + ((bLat - aLat) * step) / 10
        const lon = aLon + ((bLon - aLon) * step) / 10
        const covered = FINLAND_AIRSPACE.searches.some(search => distanceNm(search.lat, search.lon, lat, lon) <= search.radiusNm)
        expect([lat, lon, covered]).toEqual([lat, lon, true])
      }
    }
  })
})

describe('createAircraftRelayHandler', () => {
  test('requires a product user agent', () => {
    expect(() => createAircraftRelayHandler({ userAgent: ' ' })).toThrow('userAgent is required')
  })

  test('relays the upstream payload with CORS and CDN cache headers', async () => {
    const { handler, calls } = relay([new Response(PAYLOAD, { status: 200 })])
    const response = await handler(request('lat=60.17&lon=24.94&dist=75'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(PAYLOAD)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=25, s-maxage=25, stale-while-revalidate=60')
    expect(response.headers.get('X-Cache')).toBeNull()
    expect(calls).toEqual([{ url: 'https://api.adsb.lol/v2/lat/60.1700/lon/24.9400/dist/75', userAgent: 'RelayTest/1.0' }])
  })

  test('rejects invalid input without contacting the upstream', async () => {
    const { handler, calls } = relay([])
    const invalid = await handler(request('lat=999&lon=1'))
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'Missing or invalid lat/lon parameters', ac: [] })
    const post = await handler(request('lat=60&lon=24', { method: 'POST' }))
    expect(post.status).toBe(405)
    expect(post.headers.get('Allow')).toBe('GET, HEAD')
    expect(calls).toHaveLength(0)
  })

  test('passes upstream failures through with an empty aircraft list', async () => {
    const { handler } = relay([new Response('busy', { status: 429 }), new Error('network down')])
    const throttled = await handler(request('lat=60.17&lon=24.94'))
    expect(throttled.status).toBe(429)
    expect(throttled.headers.get('Cache-Control')).toBe('public, max-age=10, stale-while-revalidate=30')
    expect(await throttled.json()).toEqual({ error: 'Upstream returned status 429', ac: [] })
    const failed = await handler(request('lat=60.17&lon=24.94'))
    expect(failed.status).toBe(502)
    expect(await failed.json()).toEqual({ error: 'network down', ac: [] })
  })

  test('serves fresh and stale-fallback responses from its in-process cache', async () => {
    const start = new Date('2026-09-24T12:00:00Z').getTime()
    const cache = { freshMs: 25_000, staleFallbackMs: 600_000 }
    const { handler, calls } = relay([new Response(PAYLOAD), new Response('busy', { status: 429 }), new Error('network down'), new Response('busy', { status: 503 })], { cache })

    try {
      setSystemTime(start)
      const miss = await handler(request('lat=60.1712&lon=24.9401'))
      expect(miss.headers.get('X-Cache')).toBe('MISS')
      // A nearby request (same two-decimal cell) is served without an upstream call.
      const hit = await handler(request('lat=60.1698&lon=24.9449'))
      expect(hit.headers.get('X-Cache')).toBe('HIT')
      expect(await hit.text()).toBe(PAYLOAD)
      expect(calls).toHaveLength(1)

      setSystemTime(start + 60_000)
      const throttled = await handler(request('lat=60.17&lon=24.94'))
      expect(throttled.status).toBe(200)
      expect(throttled.headers.get('X-Cache')).toBe('STALE-FALLBACK')
      const offline = await handler(request('lat=60.17&lon=24.94'))
      expect(offline.headers.get('X-Cache')).toBe('STALE-FALLBACK')
      expect(await offline.text()).toBe(PAYLOAD)

      // Past the stale window the upstream failure is reported, not hidden.
      setSystemTime(start + 11 * 60_000)
      const expired = await handler(request('lat=60.17&lon=24.94'))
      expect(expired.status).toBe(503)
    } finally {
      setSystemTime()
    }
  })

  test('serves a region as one merged snapshot clipped to its outline', async () => {
    const helsinki = { hex: '461f2a', flight: 'FIN7LK  ', lat: 60.31, lon: 24.96, alt_baro: 3000, gs: 200, track: 90, category: 'A3', seen_pos: 1.5, rssi: -20, messages: 1234 }
    const tallinn = { hex: '511abc', lat: 59.41, lon: 24.83, alt_baro: 2000, seen_pos: 0.4 }
    const rovaniemi = { hex: '4ca001', lat: 66.5, lon: 25.7, alt_baro: 36000, seen_pos: 0.2 }
    const { handler, calls } = relay([
      new Response(JSON.stringify({ now: 1_000_000, ac: [helsinki, tallinn, { hex: 'nopos' }] })),
      // The northern search saw the same Helsinki aircraft two seconds later.
      new Response(JSON.stringify({ now: 1_002_000, ac: [rovaniemi, { ...helsinki, seen_pos: 0.1 }] })),
    ], { regions: { finland: FINLAND_AIRSPACE }, searchSpacingMs: 0 })

    const response = await handler(request('region=finland'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=20, s-maxage=25, stale-while-revalidate=30')
    expect(calls.map(call => call.url)).toEqual([
      'https://api.adsb.lol/v2/lat/61.6000/lon/24.9000/dist/250',
      'https://api.adsb.lol/v2/lat/67.3000/lon/25.8000/dist/250',
    ])
    expect(await response.json()).toEqual({
      now: 1_002_000,
      ac: [
        { hex: '461f2a', flight: 'FIN7LK  ', lat: 60.31, lon: 24.96, alt_baro: 3000, gs: 200, track: 90, category: 'A3', seen_pos: 0.1 },
        { hex: '4ca001', lat: 66.5, lon: 25.7, alt_baro: 36000, seen_pos: 0.2 },
      ],
    })
  })

  test('lets the CDN keep region snapshots for a configured time', async () => {
    const empty = () => new Response(JSON.stringify({ now: 1_000_000, ac: [] }))
    const { handler } = relay([empty(), empty()], { regions: { finland: FINLAND_AIRSPACE }, regionCacheSeconds: 60, searchSpacingMs: 0 })
    const response = await handler(request('region=finland'))
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=55, s-maxage=60, stale-while-revalidate=30')
  })

  test('rejects unknown regions without contacting the upstream', async () => {
    const { handler, calls } = relay([], { regions: { finland: FINLAND_AIRSPACE } })
    for (const name of ['sweden', '__proto__', 'constructor', '']) {
      const response = await handler(request(`region=${name}`))
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Unknown region', ac: [] })
    }
    expect((await relay([]).handler(request('region=finland'))).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  test('retries a throttled region search once, after a pause', async () => {
    const empty = () => new Response(JSON.stringify({ now: 1_000_000, ac: [] }))
    const { handler, calls } = relay([empty(), new Response('busy', { status: 420 }), empty()], { regions: { finland: FINLAND_AIRSPACE }, searchSpacingMs: 5 })
    const startedAt = performance.now()
    const response = await handler(request('region=finland'))
    expect(response.status).toBe(200)
    expect(calls.map(call => call.url.split('/v2/')[1])).toEqual(['lat/61.6000/lon/24.9000/dist/250', 'lat/67.3000/lon/25.8000/dist/250', 'lat/67.3000/lon/25.8000/dist/250'])
    // One pause between the searches and a double pause before the retry.
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(14)
  })

  test('reports a throttled region search as 429 and falls back to the cached snapshot', async () => {
    const start = new Date('2026-09-24T12:00:00Z').getTime()
    const empty = () => new Response(JSON.stringify({ now: start, ac: [] }))
    const busy = (status: number) => new Response('busy', { status })
    const uncached = relay([empty(), busy(429), busy(420)], { regions: { finland: FINLAND_AIRSPACE }, searchSpacingMs: 0 })
    const throttled = await uncached.handler(request('region=finland'))
    expect(throttled.status).toBe(429)
    expect(throttled.headers.get('Cache-Control')).toBe('public, max-age=30, s-maxage=30')
    expect(await throttled.json()).toEqual({ error: 'Upstream returned status 420', ac: [] })

    const cache = { freshMs: 45_000, staleFallbackMs: 600_000 }
    const { handler, calls } = relay([empty(), empty(), empty(), busy(429), busy(429)], { regions: { finland: FINLAND_AIRSPACE }, cache, searchSpacingMs: 0 })
    try {
      setSystemTime(start)
      expect((await handler(request('region=finland'))).headers.get('X-Cache')).toBe('MISS')
      expect((await handler(request('region=finland'))).headers.get('X-Cache')).toBe('HIT')
      expect(calls).toHaveLength(2)
      setSystemTime(start + 60_000)
      const stale = await handler(request('region=finland'))
      expect(stale.status).toBe(200)
      expect(stale.headers.get('X-Cache')).toBe('STALE-FALLBACK')
      expect(calls).toHaveLength(5)
    } finally {
      setSystemTime()
    }
  })

  test('bounds the number of cached locations', async () => {
    const cache = { freshMs: 60_000, staleFallbackMs: 600_000, maxEntries: 2 }
    const { handler, calls } = relay([new Response(PAYLOAD), new Response(PAYLOAD), new Response(PAYLOAD), new Response(PAYLOAD)], { cache })
    for (const lat of ['10', '20', '30', '10']) await handler(request(`lat=${lat}&lon=0`))
    // The first location was evicted when the third arrived, so it is fetched again.
    expect(calls).toHaveLength(4)
  })
})
