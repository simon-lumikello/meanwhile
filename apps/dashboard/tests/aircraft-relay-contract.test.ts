import { expect, test } from 'bun:test'
import { stubFetch } from './support/stubFetch'
import { fetchAircraft, fetchAircraftRegion, MAX_AIRPLANE_RADIUS_NM, STANDARD_AIRPLANE_RADIUS_NM } from '@simon-lumikello/meanwhile-radar/sources'
import { createAircraftRelayHandler } from '@simon-lumikello/meanwhile-relay/aircraft'
import { DASHBOARD_AIRCRAFT_REGIONS, DASHBOARD_AIRCRAFT_RELAY_PATHS } from '../server/aircraftRelay.ts'
import { DASHBOARD_AIRCRAFT_REGION } from '../src/hooks/useWeatherQueries'

function contractRelay(respond: () => unknown, upstreamCalls: string[]) {
  return createAircraftRelayHandler({
    userAgent: 'ContractTest/1.0',
    regions: DASHBOARD_AIRCRAFT_REGIONS,
    fetch: stubFetch(async input => {
      upstreamCalls.push(String(input))
      return new Response(JSON.stringify(respond()))
    }),
  })
}

// The browser radar library and the server relay library are independent
// packages; this checks the wire contract between them where both are composed.
test('the dashboard region request becomes one Finland snapshot of parsed planes', async () => {
  const upstreamCalls: string[] = []
  const snapshotAt = Date.now() - 20_000
  const handler = contractRelay(() => ({
    now: snapshotAt,
    ac: [
      { hex: '461f2a', flight: 'FIN7LK  ', lat: 60.31, lon: 24.96, alt_baro: 3000, gs: 200, track: 90, category: 'A3', seen_pos: 1 },
      { hex: 'estonia', lat: 59.41, lon: 24.83, alt_baro: 2000 },
      { hex: 'nopos' },
    ],
  }), upstreamCalls)

  const relayRequests: string[] = []
  const planes = await fetchAircraftRegion(DASHBOARD_AIRCRAFT_REGION, {
    relayUrl: DASHBOARD_AIRCRAFT_RELAY_PATHS[0],
    transport: {
      fetch: (input, init) => {
        const url = new URL(String(input), 'https://dashboard.test')
        relayRequests.push(url.pathname + url.search)
        return handler(new Request(url, init))
      },
    },
  })

  expect(relayRequests).toEqual(['/api/adsb-proxy?region=finland'])
  // Every viewer shares the same fixed searches; nothing about the viewer's location is forwarded.
  expect(upstreamCalls).toEqual([
    `https://api.adsb.lol/v2/lat/61.6000/lon/24.9000/dist/${MAX_AIRPLANE_RADIUS_NM}`,
    `https://api.adsb.lol/v2/lat/67.3000/lon/25.8000/dist/${MAX_AIRPLANE_RADIUS_NM}`,
  ])
  expect(planes.map(plane => [plane.icao24, plane.callsign, plane.altitude, plane.lastContact])).toEqual([
    ['461f2a', 'FIN7LK', 3000 * 0.3048, snapshotAt / 1000 - 1],
  ])
})

test('a single-point search still passes through the relay', async () => {
  const upstreamCalls: string[] = []
  const handler = contractRelay(() => ({ ac: [] }), upstreamCalls)
  await fetchAircraft(60.1695, 24.9354, {
    relayUrl: DASHBOARD_AIRCRAFT_RELAY_PATHS[0],
    transport: { fetch: (input, init) => handler(new Request(new URL(String(input), 'https://dashboard.test'), init)) },
  })
  expect(upstreamCalls).toEqual([`https://api.adsb.lol/v2/lat/60.1700/lon/24.9400/dist/${STANDARD_AIRPLANE_RADIUS_NM}`])
})

test('the dashboard keeps serving the legacy OpenSky path', () => {
  expect(DASHBOARD_AIRCRAFT_RELAY_PATHS).toEqual(['/api/adsb-proxy', '/api/opensky-proxy'])
})
