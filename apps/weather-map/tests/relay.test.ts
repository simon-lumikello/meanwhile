import { expect, test } from 'bun:test'
import { DEFAULT_AIRCRAFT_RELAY_URL, resolveAircraftRelayUrl } from '../src/relay'

test('aircraft overlay uses the same-origin relay unless a build disables it', () => {
  expect(resolveAircraftRelayUrl(undefined)).toBe(DEFAULT_AIRCRAFT_RELAY_URL)
  expect(DEFAULT_AIRCRAFT_RELAY_URL).toBe('/api/adsb-proxy')
  expect(resolveAircraftRelayUrl('/custom/relay')).toBe('/custom/relay')
  expect(resolveAircraftRelayUrl('  ')).toBeUndefined()
  expect(resolveAircraftRelayUrl('')).toBeUndefined()
})
