import { expect, test } from 'bun:test'
import handler, { config } from '../api/adsb-proxy'
import { AIRCRAFT_RELAY_PATH, RADAR_AIRCRAFT_REGION, RADAR_AIRCRAFT_REGIONS } from '../server/aircraftRelay'
import { AIRCRAFT_REGION, DEFAULT_AIRCRAFT_RELAY_URL } from '../src/relay'

test('the edge relay runs on the edge and serves the path the app calls', () => {
  expect(config.runtime).toBe('edge')
  expect(AIRCRAFT_RELAY_PATH).toBe(DEFAULT_AIRCRAFT_RELAY_URL)
})

test('the relay serves the region the app polls', () => {
  expect(RADAR_AIRCRAFT_REGION).toBe(AIRCRAFT_REGION)
  expect(Object.keys(RADAR_AIRCRAFT_REGIONS)).toEqual([AIRCRAFT_REGION])
})

test('the edge relay rejects invalid requests without contacting the upstream', async () => {
  const invalid = await handler(new Request('https://map.test/api/adsb-proxy?lat=999&lon=1'))
  expect(invalid.status).toBe(400)
  expect(await invalid.json()).toEqual({ error: 'Missing or invalid lat/lon parameters', ac: [] })
  const post = await handler(new Request('https://map.test/api/adsb-proxy?lat=60&lon=24', { method: 'POST' }))
  expect(post.status).toBe(405)
})
