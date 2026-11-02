import { expect, test } from 'bun:test'
import { AMBIENT_STORAGE_KEY, DEFAULT_AMBIENT_CONFIG, parseAmbientConfig } from '../src/storage'

test('weather clock settings are validated and use only their storage key', () => {
  const restored = parseAmbientConfig({ latitude: 61.5, longitude: 23.7, brightness: 0, showRadar: true })
  expect(AMBIENT_STORAGE_KEY).toBe('family_ambient_config_v1')
  expect(restored.latitude).toBe(61.5)
  expect(restored.longitude).toBe(23.7)
  expect(restored.brightness).toBe(DEFAULT_AMBIENT_CONFIG.brightness)
  expect(restored.showRadar).toBe(true)
})

test('the week ahead stays off until switched on, and the choice is remembered', () => {
  expect(parseAmbientConfig({}).showWeek).toBe(false)
  expect(parseAmbientConfig({ showWeek: 'yes' }).showWeek).toBe(false)
  expect(parseAmbientConfig({ showWeek: true }).showWeek).toBe(true)
})
