import { describe, expect, it } from 'bun:test'
import {
  getSolarPosition,
  getLunarPosition,
  getCelestialLightSource,
} from '../src/core'

describe('Solar and Lunar Celestial Position Engine', () => {
  it('calculates solar position accurately for solar noon in Helsinki', () => {
    // 2026 Summer Solstice approx solar noon in Helsinki (60.1695, 24.9354):
    // UTC noon + eqtime offset -> approx 10:20 UTC
    const date = new Date('2026-06-21T10:20:00Z')
    const pos = getSolarPosition(date, 60.1695, 24.9354)

    // At solar noon, azimuth should be due South (approx 180°)
    expect(pos.azimuth).toBeGreaterThan(170)
    expect(pos.azimuth).toBeLessThan(190)

    // Elevation in Helsinki at summer solstice should be ~53° (90 - 60.17 + 23.44)
    expect(pos.elevation).toBeGreaterThan(45)
    expect(pos.elevation).toBeLessThan(56)
  })

  it('calculates solar position for winter night in Helsinki', () => {
    const date = new Date('2026-12-21T22:00:00Z')
    const pos = getSolarPosition(date, 60.1695, 24.9354)

    // At midnight, elevation should be deeply below the horizon (negative)
    expect(pos.elevation).toBeLessThan(-30)
  })

  it('calculates lunar position and valid moon illumination phase', () => {
    const date = new Date('2026-09-12T20:00:00Z')
    const moon = getLunarPosition(date, 60.1695, 24.9354)

    expect(moon.azimuth).toBeGreaterThanOrEqual(0)
    expect(moon.azimuth).toBeLessThanOrEqual(360)
    expect(moon.elevation).toBeGreaterThanOrEqual(-90)
    expect(moon.elevation).toBeLessThanOrEqual(90)
    expect(moon.illumination).toBeGreaterThanOrEqual(0)
    expect(moon.illumination).toBeLessThanOrEqual(1)
    expect(typeof moon.phaseName).toBe('string')
    expect(moon.phaseName.length).toBeGreaterThan(0)
  })

  it('determines Sun as primary light source during daytime with proper shadow offset', () => {
    // Summer afternoon in Helsinki
    const afternoon = new Date('2026-06-21T12:00:00Z')
    const light = getCelestialLightSource(afternoon, 60.1695, 24.9354)

    expect(light.type).toBe('sun')
    expect(light.isNight).toBe(false)
    expect(light.shadowStrength).toBeGreaterThan(0.2)
    expect(light.shadowOffset[0]).toBeDefined()
    expect(light.shadowOffset[1]).toBeDefined()
    // Shadow offset magnitude should be sensible
    const dist = Math.hypot(light.shadowOffset[0], light.shadowOffset[1])
    expect(dist).toBeGreaterThan(0.01)
    expect(dist).toBeLessThan(0.08)
    // Normalized 3D light vector should have unit length
    const len = Math.hypot(light.lightDir[0], light.lightDir[1], light.lightDir[2])
    expect(len).toBeCloseTo(1.0, 2)
  })

  it('determines Moon or Night ambient as light source during night with proper shadow parameters', () => {
    // Midnight in Helsinki
    const night = new Date('2026-12-21T23:00:00Z')
    const light = getCelestialLightSource(night, 60.1695, 24.9354)

    expect(light.isNight).toBe(true)
    expect(light.type === 'moon' || light.type === 'ambient').toBe(true)
    expect(light.shadowStrength).toBeGreaterThan(0.0)
    expect(light.shadowStrength).toBeLessThanOrEqual(0.35)
    const dist = Math.hypot(light.shadowOffset[0], light.shadowOffset[1])
    expect(dist).toBeGreaterThan(0.01)
    expect(dist).toBeLessThan(0.08)
  })
})
