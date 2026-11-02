import { describe, expect, test } from 'bun:test'
import { getCelestialLightSource, getSolarPosition } from '@simon-lumikello/meanwhile-weather/core'
import { NIGHT_ELEVATION, cloudLightingSun, nightLight, volumeFrame, type VolumeLight } from '../src/cloudLighting'
import { CLOUD_VOLUME_TUNING } from '../src/cloudVisualTuning'
import type { Vec3, VolumeFrame } from '../src/volumetricClouds'

const HELSINKI = [60.1695, 24.9354] as const
const JYVASKYLA = [62.2426, 25.7473] as const

const FRAME: Omit<VolumeFrame, VolumeLight> = {
  width: 1, height: 1, viewOrigin: [0, 0], viewSize: [1, 1], texOrigin: [0, 0], texSize: [1, 1],
  morph: 0, morphing: false, advection: [0, 0], blurRadius: 1, rainRadius: 1, levelMeters: 1, levelT: 0,
  drift: [0, 0], boil: 0,
}

/** The clouds' lighting over Jyväskylä at `time`, and the sun's elevation then. */
function lightingAt(time: Date) {
  const sun = cloudLightingSun('time-of-day', time, ...JYVASKYLA)
  const celestial = getCelestialLightSource(sun.date, ...JYVASKYLA)
  const frame = volumeFrame(FRAME, celestial, { azimuth: sun.azimuth, elevation: sun.elevation, latitude: JYVASKYLA[0], x: 0, y: 0 }, true)
  return { elevation: sun.elevation, frame }
}

/**
 * The night light the shader adds over the observer, as it draws it: faded in by the sun's
 * elevation while sunlit (see `nightShare`), all of it at night.
 */
function nightLightDrawn({ elevation, frame }: ReturnType<typeof lightingAt>): number {
  const v = CLOUD_VOLUME_TUNING
  const t = Math.min(1, Math.max(0, (elevation - v.twilightEnd) / (v.nightLightFrom - v.twilightEnd)))
  const share = frame.sunLit ? 1 - t * t * (3 - 2 * t) : 1
  return Math.max(...frame.lightColor) * share
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
const mixColor = (a: readonly number[], b: readonly number[], t: number) => a.map((value, i) => value + (b[i] - value) * t)

/**
 * All the light a cloud 3 km up over the observer gets, as the shader works it out (brightest
 * channel): sunlight, the sky's fill, and the night light.
 */
function totalLight(step: ReturnType<typeof lightingAt>): number {
  const v = CLOUD_VOLUME_TUNING
  if (!step.frame.sunLit) return Math.max(...step.frame.lightColor) + Math.max(...step.frame.skyColor)
  const e = step.elevation
  const seen = e + Math.sqrt(2 * 3000 / 6371000) * 180 / Math.PI + 0.833
  let sun = mixColor(v.sunHorizonColor, v.sunLowColor, smoothstep(0, 5, seen))
  sun = mixColor(sun, v.sunColor, smoothstep(5, v.sunDayElevation, seen))
  const sunlight = Math.max(...sun) * v.sunIntensity * smoothstep(0, 1.5, seen)
  let sky = mixColor(v.nightSkyColor, v.duskSkyColor, smoothstep(v.twilightEnd, -3, e))
  sky = mixColor(sky, v.twilightSkyColor, smoothstep(-3, 3, e))
  sky = mixColor(sky, v.skyColor, smoothstep(5, 18, e))
  return sunlight + Math.max(...sky) + nightLightDrawn(step)
}

/** Ground shadow strength as the shader draws it: sunlit shadows fade out as the ground loses the sun. */
function shadowDrawn({ elevation, frame }: ReturnType<typeof lightingAt>): number {
  if (!frame.sunLit) return frame.shadowStrength
  const t = Math.min(1, Math.max(0, (elevation + 1) / 1.5))
  return frame.shadowStrength * t * t * (3 - 2 * t)
}

const angleDegrees = (a: Vec3, b: Vec3) =>
  Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180 / Math.PI

/** Lighting every half minute from `from` to `to`. */
function sweep(from: string, to: string) {
  const steps: ReturnType<typeof lightingAt>[] = []
  for (let time = Date.parse(from); time <= Date.parse(to); time += 30_000) steps.push(lightingAt(new Date(time)))
  return steps
}

// The evening of 2026-09-27 and the next morning, from daylight to deep night and back.
const DUSK = sweep('2026-09-27T14:30:00Z', '2026-09-27T21:00:00Z')
const DAWN = sweep('2026-09-28T00:00:00Z', '2026-09-28T06:00:00Z')

describe('cloud lighting from sunset through the night to sunrise', () => {
  test('the sweeps run from daylight past the night handover', () => {
    for (const steps of [DUSK, DAWN]) {
      expect(Math.max(...steps.map(step => step.elevation))).toBeGreaterThan(0)
      expect(Math.min(...steps.map(step => step.elevation))).toBeLessThan(NIGHT_ELEVATION)
    }
  })

  for (const [name, steps] of [['sunset', DUSK], ['sunrise', DAWN]] as const) {
    test(`${name}: the clouds never get darker than at night, so they never go black in between`, () => {
      const v = CLOUD_VOLUME_TUNING
      const moonlessNight = v.nightLight * Math.max(...v.moonColor) + Math.max(...v.nightSkyColor)
      for (const step of steps) {
        expect(totalLight(step)).toBeGreaterThanOrEqual(moonlessNight - 1e-9)
        if (step.elevation <= v.twilightEnd) {
          expect(nightLightDrawn(step)).toBeGreaterThanOrEqual(CLOUD_VOLUME_TUNING.nightLight - 1e-9)
        }
      }
    })

    test(`${name}: light, its direction, and ground shadows change smoothly, handover included`, () => {
      for (let i = 1; i < steps.length; i++) {
        const [a, b] = [steps[i - 1], steps[i]]
        // The light turns from the sun to the moon, gradually, while the sky is dim.
        expect(angleDegrees(a.frame.lightDir, b.frame.lightDir)).toBeLessThan(3)
        // Once the last red glow has left the cloud (sunset itself dims quickly), the light
        // eases between twilight and night without a step.
        if (Math.max(a.elevation, b.elevation) < -2.6) expect(Math.abs(totalLight(a) - totalLight(b))).toBeLessThan(0.01)
        expect(Math.abs(nightLightDrawn(a) - nightLightDrawn(b))).toBeLessThan(0.02)
        expect(Math.abs(shadowDrawn(a) - shadowDrawn(b))).toBeLessThan(0.02)
      }
    })
  }

  test('a moonless night keeps the night light; the moon only brightens it', () => {
    const moonless = nightLight({ type: 'ambient', azimuth: 0, elevation: -10, lightDir: [0, 0, 1], shadowOffset: [0, 0], shadowStrength: 0.08, isNight: true, label: '' })
    expect(Math.max(...moonless.color)).toBeCloseTo(CLOUD_VOLUME_TUNING.nightLight, 6)
    const fullMoon = nightLight({ type: 'moon', azimuth: 180, elevation: 30, lightDir: [0, 0.5, 0.8], shadowOffset: [0, 0], shadowStrength: 0.26, isNight: true, label: '' })
    expect(Math.max(...fullMoon.color)).toBeGreaterThan(CLOUD_VOLUME_TUNING.nightLight)
  })
})

describe('cloudLightingSun', () => {
  test('follows the real sun by time of day', () => {
    const evening = new Date('2026-09-26T16:30:00Z')
    const sun = cloudLightingSun('time-of-day', evening, ...HELSINKI)
    expect(sun.date).toBe(evening)
    expect(sun.elevation).toBeCloseTo(getSolarPosition(evening, ...HELSINKI).elevation, 6)
    expect(sun.elevation).toBeLessThan(0)
  })

  test('noon lights the clouds from the south at the day\'s highest sun, whatever the time', () => {
    const night = new Date('2026-09-26T22:00:00Z')
    const sun = cloudLightingSun('noon', night, ...HELSINKI)
    expect(sun.azimuth).toBeGreaterThan(175)
    expect(sun.azimuth).toBeLessThan(185)
    expect(sun.elevation).toBeGreaterThan(25)
    // Solar noon in Helsinki is about 10:20 UTC.
    expect(Math.abs(sun.date.getTime() - Date.parse('2026-09-26T10:20:00Z'))).toBeLessThan(15 * 60 * 1000)
  })

  test('noon never takes on sunset colours, even in the polar night', () => {
    const utsjoki = [69.9, 27.0] as const
    const sun = cloudLightingSun('noon', new Date('2026-12-21T12:00:00Z'), ...utsjoki)
    expect(sun.elevation).toBe(CLOUD_VOLUME_TUNING.sunDayElevation)
  })
})
