import { describe, expect, it } from 'bun:test'
import {
  createAircraftMotion,
  GLIDE_MAX_METERS,
  GLIDE_MS,
  MAX_TURN_S,
  predictAircraft,
  showAircraft,
} from '../src/aircraftMotion'
import { latLonToWebMercator } from '../src/mercator'
import { parseAirplaneState } from '../src/sources/aircraft'
import type { AirplaneData } from '../src/types'

const LATITUDE = 60.3
const SCALE = 1 / Math.cos((LATITUDE * Math.PI) / 180)
const origin = latLonToWebMercator(LATITUDE, 25)

function plane(overrides: Partial<AirplaneData> = {}): AirplaneData {
  return {
    icao24: '461f65', callsign: 'FIN1', originCountry: '', latitude: LATITUDE, longitude: 25,
    altitude: 3000, velocity: 100, trueTrack: 0, category: 3, lastContact: 1_000, ...overrides,
  }
}

/** Ground meters east and north of the report's position. */
const offset = (pose: { x: number; y: number }) => ({ east: (pose.x - origin.x) / SCALE, north: (pose.y - origin.y) / SCALE })

describe('aircraft motion', () => {
  it('flies straight along the track without a turn rate', () => {
    const pose = predictAircraft(plane({ trueTrack: 90 }), 60_000)
    expect(offset(pose).east).toBeCloseTo(6_000, 3)
    expect(offset(pose).north).toBeCloseTo(0, 3)
    expect(pose.track).toBeCloseTo(90, 6)
  })

  it('follows the reported turn, then flies straight on the new track', () => {
    // 3°/s for MAX_TURN_S turns north onto east; the rest of the minute is straight.
    const rate = 90 / MAX_TURN_S
    const pose = predictAircraft(plane({ trackRate: rate }), 60_000)
    const radius = 100 / ((rate * Math.PI) / 180)
    expect(pose.track).toBeCloseTo(90, 6)
    expect(offset(pose).east).toBeCloseTo(radius + 100 * (60 - MAX_TURN_S), 3)
    expect(offset(pose).north).toBeCloseTo(radius, 3)
  })

  it('turns left for a negative rate', () => {
    const pose = predictAircraft(plane({ trackRate: -2 }), 10_000)
    expect(pose.track).toBeCloseTo(340, 6)
    expect(offset(pose).east).toBeLessThan(0)
  })

  it('glides a small miss into place from where the aircraft was shown', () => {
    const motion = createAircraftMotion()
    const first = plane()
    const t = 1_050_000
    const before = showAircraft(motion, first, t).pose
    // The next report puts it about 5 km from the guess, heading 20° further right.
    const next = plane({ longitude: 25 + 1_000 / (111_320 * Math.cos((LATITUDE * Math.PI) / 180)), trueTrack: 20, lastContact: 1_050 })
    const atReport = showAircraft(motion, next, t + 16)
    expect(atReport.jumped).toBe(false)
    expect(Math.hypot(atReport.pose.x - before.x, atReport.pose.y - before.y) / SCALE).toBeLessThan(10)
    // The miss is measured from the pose on screen to the new guess, which began at the first frame.
    expect(atReport.miss?.since).toBe(t)
    expect(atReport.miss?.x).toBeCloseTo(atReport.pose.x - atReport.guess.x, 6)
    expect(atReport.miss?.y).toBeCloseTo(atReport.pose.y - atReport.guess.y, 6)
    expect(showAircraft(motion, next, t + 32).miss).toBeNull()
    expect(atReport.pose.track).toBeCloseTo(0, 0)
    const settled = showAircraft(motion, next, t + 16 + GLIDE_MS).pose
    const truth = predictAircraft(next, t + 16 + GLIDE_MS - 1_050_000)
    expect(settled.x).toBeCloseTo(truth.x, 6)
    expect(settled.y).toBeCloseTo(truth.y, 6)
    expect(settled.track).toBeCloseTo(20, 6)
  })

  it('reports a jump when the miss is too large to glide', () => {
    const motion = createAircraftMotion()
    showAircraft(motion, plane(), 1_050_000)
    const farNorth = plane({ latitude: LATITUDE + (GLIDE_MAX_METERS * 2) / 111_320, lastContact: 1_050 })
    const result = showAircraft(motion, farNorth, 1_050_016)
    expect(result.jumped).toBe(true)
    expect(result.miss).toBeNull()
    expect(result.pose).toEqual(predictAircraft(farNorth, 16))
  })

  it('does not glide from a pose that has not been shown for a while', () => {
    const motion = createAircraftMotion()
    showAircraft(motion, plane(), 1_050_000)
    const moved = plane({ latitude: LATITUDE + (GLIDE_MAX_METERS * 2) / 111_320, lastContact: 1_100 })
    const result = showAircraft(motion, moved, 1_100_000)
    expect(result.jumped).toBe(false)
    expect(result.pose).toEqual(predictAircraft(moved, 0))
  })
})

describe('turn rate parsing', () => {
  const base = { hex: 'abc', lat: 60.3, lon: 25, gs: 250, track: 90 }

  it('reads the reported track rate', () => {
    expect(parseAirplaneState({ ...base, track_rate: 1.5, roll: 30 })?.trackRate).toBe(1.5)
  })

  it('derives the rate of a coordinated turn from the bank angle when no rate is reported', () => {
    const rate = parseAirplaneState({ ...base, roll: 25 })?.trackRate ?? 0
    const expected = ((9.81 * Math.tan((25 * Math.PI) / 180)) / (250 * 0.514444)) * (180 / Math.PI)
    expect(rate).toBeCloseTo(expected, 6)
  })

  it('caps implausible rates and leaves the rate out when unknown', () => {
    expect(parseAirplaneState({ ...base, track_rate: 40 })?.trackRate).toBe(6)
    expect(parseAirplaneState(base)).not.toHaveProperty('trackRate')
  })
})
