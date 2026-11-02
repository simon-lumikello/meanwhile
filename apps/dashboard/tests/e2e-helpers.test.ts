import { expect, test } from 'bun:test'
import { createBaseConfig } from '../e2e/test-helpers'

test('createBaseConfig retains night-mode defaults when applying a partial nested override', () => {
  const config = createBaseConfig({ nightMode: { enabled: true } })

  expect(config.nightMode).toMatchObject({
    enabled: true,
    startHour: 21,
    endHour: 7,
  })
})

test('createBaseConfig retains weather map defaults when applying a partial nested override', () => {
  const config = createBaseConfig({ weatherMap: { size: 'compact' } })

  expect(config.weatherMap).toMatchObject({
    size: 'compact',
    showOnTimeline: true,
    renderMode: 'radar-blocks',
  })
})
