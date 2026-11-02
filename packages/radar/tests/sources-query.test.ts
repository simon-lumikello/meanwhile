import { afterEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { AircraftRequestError, fetchAircraft, fetchAircraftRegion, MAX_AIRPLANE_RADIUS_NM, STANDARD_AIRPLANE_RADIUS_NM } from '../src/sources/aircraft'
import { fetchFmiRadarRainRate } from '../src/sources/fmi'
import { aircraftQueryOptions, aircraftRegionQueryOptions, lightningQueryOptions, radarRainRateQueryOptions } from '../src/query'

const clients: QueryClient[] = []
afterEach(() => clients.splice(0).forEach(client => client.clear()))

describe('radar source adapters', () => {
  it('does not call transport for unsupported FMI coverage and preserves injected transport failures as empty telemetry', async () => {
    let calls = 0
    const transport = { fetch: async () => { calls += 1; throw new Error('offline') } }
    expect(await fetchFmiRadarRainRate(35.6, 139.6, { transport })).toBeNull()
    expect(calls).toBe(0)
    expect(await fetchFmiRadarRainRate(60.17, 24.94, { transport })).toBeNull()
    expect(calls).toBe(1)
  })

  it('requires an explicit aircraft relay and preserves cancellation through injected transport', async () => {
    let calls = 0
    const transport = { fetch: async (_url: RequestInfo | URL, init?: RequestInit) => { calls += 1; expect(init?.signal?.aborted).toBe(false); return new Response(JSON.stringify({ ac: [] })) } }
    expect(await fetchAircraft(60.17, 24.94, { transport })).toEqual([])
    expect(calls).toBe(0)
    expect(await fetchAircraft(60.17, 24.94, { relayUrl: 'https://relay.example/aircraft', transport })).toEqual([])
    expect(calls).toBe(1)
  })

  it('requests the given aircraft radius, bounded to what the upstream accepts', async () => {
    const requested: string[] = []
    const transport = { fetch: async (url: RequestInfo | URL) => { requested.push(new URL(String(url)).searchParams.get('dist') ?? ''); return new Response(JSON.stringify({ ac: [] })) } }
    const config = { relayUrl: 'https://relay.example/aircraft', transport }
    await fetchAircraft(60.17, 24.94, config)
    await fetchAircraft(60.17, 24.94, config, undefined, 149.2)
    await fetchAircraft(60.17, 24.94, config, undefined, 900)
    expect(requested).toEqual([String(STANDARD_AIRPLANE_RADIUS_NM), '150', String(MAX_AIRPLANE_RADIUS_NM)])
  })

  it('requests a region snapshot by name and dates positions by the snapshot time', async () => {
    const requested: string[] = []
    const snapshotAt = Date.now() - 30_000
    const transport = { fetch: async (url: RequestInfo | URL) => {
      requested.push(new URL(String(url)).search)
      return new Response(JSON.stringify({ now: snapshotAt, ac: [{ hex: '461f2a', lat: 60.31, lon: 24.96, gs: 200, track: 90, seen_pos: 2 }] }))
    } }
    expect(await fetchAircraftRegion('finland', { transport })).toEqual([])
    const planes = await fetchAircraftRegion('finland', { relayUrl: 'https://relay.example/aircraft', transport })
    expect(requested).toEqual(['?region=finland'])
    expect(planes.map(plane => [plane.icao24, plane.lastContact])).toEqual([['461f2a', snapshotAt / 1000 - 2]])
  })

  it('never dates a position after this clock, and reports throttling by status', async () => {
    const future = { fetch: async () => new Response(JSON.stringify({ now: Date.now() + 600_000, ac: [{ hex: 'a', lat: 60, lon: 25 }] })) }
    const [plane] = await fetchAircraftRegion('finland', { relayUrl: '/relay', transport: future })
    expect(plane.lastContact).toBeLessThanOrEqual(Date.now() / 1000)
    const throttled = { fetch: async () => new Response('{"ac":[]}', { status: 429 }) }
    const error = await fetchAircraftRegion('finland', { relayUrl: '/relay', transport: throttled }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AircraftRequestError)
    expect((error as AircraftRequestError).status).toBe(429)
  })
})

describe('radar query contracts', () => {
  it('partitions aircraft queries by explicit relay and disables optional feeds without invoking a request', () => {
    const disabled = aircraftQueryOptions(60.17, 24.94, { relayUrl: 'https://one.example' }, false)
    const changedSource = aircraftQueryOptions(60.17, 24.94, { relayUrl: 'https://two.example' }, true)
    expect(disabled.enabled).toBe(false)
    expect(disabled.queryKey).not.toEqual(changedSource.queryKey)
  })

  it('retries a failed aircraft request within seconds, so a newly shown area is not left empty', () => {
    const options = aircraftQueryOptions(60.17, 24.94, { relayUrl: 'https://one.example' })
    expect(options.retry).toBeGreaterThanOrEqual(1)
    const retryDelay = options.retryDelay as (attempt: number, error: Error) => number
    expect(retryDelay(0, new Error('slow upstream'))).toBeLessThanOrEqual(5000)
  })

  it('polls a region no faster than every 15 s under one key, and leaves a throttled upstream alone', () => {
    const options = aircraftRegionQueryOptions('finland', { relayUrl: 'https://one.example' })
    expect([...options.queryKey]).toEqual(['radar', 'aircraft-region', 'finland', 'https://one.example'])
    // Each refresh is two upstream searches; faster polling risks the upstream's throttling.
    expect(options.refetchInterval).toBeGreaterThanOrEqual(15_000)
    expect(aircraftRegionQueryOptions('finland', { relayUrl: 'https://one.example' }, false).enabled).toBe(false)
    expect(aircraftRegionQueryOptions('finland', {}).enabled).toBe(false)
    const retry = options.retry as (failureCount: number, error: Error) => boolean
    expect(retry(0, new AircraftRequestError(429))).toBe(false)
    expect(retry(0, new AircraftRequestError(502))).toBe(true)
    expect(retry(1, new AircraftRequestError(502))).toBe(false)
  })

  it('partitions aircraft queries by search radius', () => {
    const standard = aircraftQueryOptions(60.17, 24.94, { relayUrl: 'https://one.example' })
    const wider = aircraftQueryOptions(60.17, 24.94, { relayUrl: 'https://one.example' }, true, 200)
    expect(standard.queryKey).toEqual(aircraftQueryOptions(60.17, 24.94, { relayUrl: 'https://one.example' }, true, STANDARD_AIRPLANE_RADIUS_NM).queryKey)
    expect(wider.queryKey).not.toEqual(standard.queryKey)
  })

  it('shares an enabled radar query and aborts it on observer teardown', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    clients.push(client)
    let started = 0
    let aborted = false
    const options = radarRainRateQueryOptions(60.17, 24.94, true, {
      transport: {
        fetch: async (_url, init) => {
          started += 1
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              aborted = true
              reject(new DOMException('aborted', 'AbortError'))
            })
          })
        },
      },
    })
    const first = new QueryObserver(client, options)
    const second = new QueryObserver(client, options)
    const unsubscribeFirst = first.subscribe(() => {})
    const unsubscribeSecond = second.subscribe(() => {})
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(started).toBe(1)
    unsubscribeFirst(); unsubscribeSecond()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(aborted).toBe(true)
  })

  it('keeps lightning query keys location-specific and optional state explicit', () => {
    const helsinki = lightningQueryOptions(60.17, 24.94, true)
    const tampere = lightningQueryOptions(61.5, 23.76, false)
    expect(helsinki.queryKey).not.toEqual(tampere.queryKey)
    expect(tampere.enabled).toBe(false)
  })
})
