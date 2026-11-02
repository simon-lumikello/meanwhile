import { expect, test } from 'bun:test'
import { DEFAULT_RADAR_CONFIG, parseRadarConfig, RADAR_STORAGE_KEY } from '../src/storage'

test('weather map settings are validated and use only their storage key', () => {
  const restored = parseRadarConfig({ latitude: 90.1, longitude: 24.9, zoom: 'wide', showAirplanes: true, renderMode: 'radar-blocks' })
  expect(RADAR_STORAGE_KEY).toBe('family_radar_config_v1')
  expect(restored.latitude).toBe(DEFAULT_RADAR_CONFIG.latitude)
  expect(restored.longitude).toBe(24.9)
  expect(restored.zoom).toBe('wide')
  expect(restored.showAirplanes).toBe(true)
  expect(restored.renderMode).toBe('radar-blocks')
})

test('cloud transparency and lighting are kept when valid', () => {
  expect(parseRadarConfig(null)).toMatchObject({ cloudTransparency: 'solid', cloudLighting: 'time-of-day' })
  expect(parseRadarConfig({ cloudTransparency: 'see-through', cloudLighting: 'noon' })).toMatchObject({ cloudTransparency: 'see-through', cloudLighting: 'noon' })
  expect(parseRadarConfig({ cloudTransparency: 'glass', cloudLighting: 'dusk' })).toMatchObject({ cloudTransparency: 'solid', cloudLighting: 'time-of-day' })
})

test('aircraft are shown unless turned off', () => {
  expect(parseRadarConfig(null).showAirplanes).toBe(true)
  expect(parseRadarConfig({ showAirplanes: false }).showAirplanes).toBe(false)
})
