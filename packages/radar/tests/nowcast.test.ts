import { describe, expect, test } from 'bun:test'
import {
  createSteeringWindModel,
  estimateRadarMotion,
  extentMotionToVelocity,
  nowcastDisplacements,
  nowcastForecastTimes,
  nowcastHistoryTimes,
  nowcastVelocity,
  radarTracer,
  renderNowcastFrame,
  sampleMotion,
  steeringWindSamplePoints,
  surfaceWindToSteering,
  velocityToExtentMotion,
  velocityToWind,
  windToVelocity,
  type NowcastExtent,
  type RgbaImage,
  type TracerGrid,
} from '../src/nowcast'
import { latLonToWebMercator } from '../src/mercator'

const WIDTH = 128
const HEIGHT = 144

/** Scattered soft blobs, the way showers look to the radar, moved by (shiftX, shiftY) pixels. */
function showers(shiftX: number, shiftY: number, width = WIDTH, height = HEIGHT): TracerGrid {
  const data = new Float32Array(width * height)
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const cells = Array.from({ length: 70 }, () => ({ x: random() * width, y: random() * height, r: 2 + random() * 4 }))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0
      for (const cell of cells) {
        const d = Math.hypot(x - shiftX - cell.x, y - shiftY - cell.y)
        value = Math.max(value, Math.max(0, 1 - d / cell.r))
      }
      data[y * width + x] = value
    }
  }
  return { width, height, data }
}

/** Roughly the FMI composite: about 3050 km wide and 3550 km tall in EPSG:3857. */
const EXTENT: NowcastExtent = { minX: 1_703_000, minY: 7_795_000, maxX: 4_757_000, maxY: 11_375_000 }

describe('radar motion', () => {
  test('recovers a known drift from a sequence of scans', () => {
    // 3 px east and 2 px south every 15 minutes.
    const frames = [0, 1, 2, 3, 4].map(k => showers(3 * k, 2 * k))
    const field = estimateRadarMotion(frames, { lagMinutes: 15 })
    const centre = sampleMotion(field, 0.5, 0.5)
    expect(centre.u * WIDTH * 15).toBeCloseTo(3, 0)
    expect(centre.v * HEIGHT * 15).toBeCloseTo(2, 0)
    expect(centre.confidence).toBeGreaterThan(0.5)
  })

  test('centres the search on the prior, finding motion beyond the search radius', () => {
    const frames = [0, 1, 2].map(k => showers(9 * k, 0))
    const prior = () => ({ u: 8 / WIDTH / 15, v: 0 })
    const centre = sampleMotion(estimateRadarMotion(frames, { lagMinutes: 15, prior, searchRadius: 3 }), 0.5, 0.5)
    expect(centre.u * WIDTH * 15).toBeCloseTo(9, 0)
  })

  test('falls back to the prior where there is no echo', () => {
    const empty = { width: WIDTH, height: HEIGHT, data: new Float32Array(WIDTH * HEIGHT) }
    const prior = () => ({ u: 0.001, v: -0.0005 })
    const field = estimateRadarMotion([empty, empty, empty], { lagMinutes: 15, prior })
    const motion = sampleMotion(field, 0.3, 0.7)
    expect(motion.u).toBeCloseTo(0.001, 6)
    expect(motion.v).toBeCloseTo(-0.0005, 6)
    expect(motion.confidence).toBe(0)
  })

  test('the tracer counts coloured echo and ignores transparent and grey no-data pixels', () => {
    const data = new Uint8ClampedArray([
      60, 120, 250, 255, /* echo */ 189, 189, 189, 255, /* no-data grey */
      0, 0, 0, 0, /* clear */ 60, 120, 250, 255, /* echo */
    ])
    const tracer = radarTracer({ width: 2, height: 2, data }, 2)
    expect(tracer.width).toBe(1)
    expect(tracer.data[0]).toBeCloseTo(0.5, 2)
  })

  test('measures motion quickly enough for the whole composite at analysis size', () => {
    const frames = [0, 1, 2, 3, 4].map(k => showers(2 * k, k, 256, 298))
    const started = performance.now()
    estimateRadarMotion(frames, { lagMinutes: 15 })
    expect(performance.now() - started).toBeLessThan(3000)
  })
})

describe('steering winds', () => {
  test('a westerly carries rain east, and a northerly carries it down the image', () => {
    const westerly = windToVelocity(10, 270)
    expect(westerly.east).toBeCloseTo(10)
    expect(westerly.north).toBeCloseTo(0)
    const motion = velocityToExtentMotion(windToVelocity(10, 0), 60, EXTENT)
    expect(motion.u).toBeCloseTo(0)
    expect(motion.v).toBeGreaterThan(0)
  })

  test('converting to extent motion and back is lossless, stretched by latitude', () => {
    const velocity = { east: 7, north: -3 }
    const motion = velocityToExtentMotion(velocity, 62, EXTENT)
    const back = extentMotionToVelocity(motion, 62, EXTENT)
    expect(back.east).toBeCloseTo(7)
    expect(back.north).toBeCloseTo(-3)
    // Mercator at 60°N doubles ground distances.
    const atSixty = velocityToExtentMotion({ east: 10, north: 0 }, 60, EXTENT)
    expect(atSixty.u * (EXTENT.maxX - EXTENT.minX) / 60).toBeCloseTo(20)
  })

  test('the direction a velocity comes from round-trips', () => {
    for (const direction of [0, 45, 135, 225, 300]) {
      expect(velocityToWind(windToVelocity(12, direction)).directionDeg).toBeCloseTo(direction)
    }
  })

  test('surface wind suggests a faster, veered steering flow', () => {
    const steering = velocityToWind(surfaceWindToSteering(5, 200))
    expect(steering.speedMs).toBeCloseTo(10)
    expect(steering.directionDeg).toBeCloseTo(220)
  })

  test('model winds interpolate in time and between places', () => {
    const model = createSteeringWindModel([
      { latitude: 60, longitude: 25, time: '2026-09-27T10:00:00Z', speedMs: 10, directionDeg: 270 },
      { latitude: 60, longitude: 25, time: '2026-09-27T11:00:00Z', speedMs: 20, directionDeg: 270 },
      { latitude: 62, longitude: 25, time: '2026-09-27T10:00:00Z', speedMs: 10, directionDeg: 180 },
    ])
    expect(model.hasData).toBe(true)
    expect(model.at(60, 25, Date.parse('2026-09-27T10:30:00Z'))!.east).toBeCloseTo(15)
    // Before and after the series, the nearest reading holds.
    expect(model.at(60, 25, Date.parse('2026-09-27T13:00:00Z'))!.east).toBeCloseTo(20)
    const between = model.at(61, 25, Date.parse('2026-09-27T10:00:00Z'))!
    expect(between.east).toBeCloseTo(5)
    expect(between.north).toBeCloseTo(5)
    expect(createSteeringWindModel([]).at(60, 25, 0)).toBeNull()
  })

  test('sample points stay inside the model domain without duplicates', () => {
    const points = steeringWindSamplePoints(69.9, 34)
    expect(points.every(point => point.latitude <= 71 && point.longitude <= 36)).toBe(true)
    expect(new Set(points.map(point => `${point.latitude},${point.longitude}`)).size).toBe(points.length)
    expect(steeringWindSamplePoints(62, 25)).toHaveLength(9)
  })
})

describe('forecast frames', () => {
  const uniform = (u: number, v: number) => ({ cols: 4, rows: 4, u: new Float32Array(16).fill(u), v: new Float32Array(16).fill(v), confidence: new Float32Array(16).fill(1) })

  test('times run from the base scan back over the motion history and forward over the forecast', () => {
    expect(nowcastHistoryTimes('2026-09-27T10:00:00.000Z', 2, 15)).toEqual(['2026-09-27T09:30:00.000Z', '2026-09-27T09:45:00.000Z', '2026-09-27T10:00:00.000Z'])
    const forecast = nowcastForecastTimes('2026-09-27T23:50:00.000Z', 30, 5)
    expect(forecast).toHaveLength(6)
    expect(forecast[0]).toBe('2026-09-27T23:55:00.000Z')
    expect(forecast.at(-1)).toBe('2026-09-28T00:20:00.000Z')
  })

  test('an echo moves with the flow by speed times lead time', () => {
    const size = 64
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 20; y < 28; y++) for (let x = 10; x < 18; x++) data.set([60, 120, 250, 255], (y * size + x) * 4)
    const base: RgbaImage = { width: size, height: size, data }
    // One pixel east per 5 minutes.
    const field = uniform(1 / size / 5, 0)
    const displacements = nowcastDisplacements(4, 4, 6, 5, (x, y) => sampleMotion(field, x, y))
    const frame = renderNowcastFrame(base, displacements[5], 4, 4, size, size)
    const centroid = () => {
      let sum = 0, weight = 0
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const alpha = frame.data[(y * size + x) * 4 + 3]
        sum += x * alpha
        weight += alpha
      }
      return sum / weight
    }
    expect(centroid()).toBeCloseTo(13.5 + 6, 0)
    // Colour survives the move.
    const inside = (24 * size + 20) * 4
    expect([...frame.data.slice(inside, inside + 4)]).toEqual([60, 120, 250, 255])
  })

  test('the model turns the measured motion as it forecasts the wind to change', () => {
    const lat = 62
    const { y: my } = latLonToWebMercator(lat, 25)
    const extent: NowcastExtent = { minX: EXTENT.minX, maxX: EXTENT.maxX, minY: my - 1_000_000, maxY: my + 1_000_000 }
    const baseTimeMs = Date.parse('2026-09-27T10:00:00Z')
    const model = createSteeringWindModel([
      { latitude: lat, longitude: 25, time: '2026-09-27T10:00:00Z', speedMs: 10, directionDeg: 270 },
      { latitude: lat, longitude: 25, time: '2026-09-27T12:00:00Z', speedMs: 10, directionDeg: 180 },
    ])
    const measured = velocityToExtentMotion({ east: 12, north: 0 }, lat, extent)
    const field = { cols: 1, rows: 1, u: new Float32Array([measured.u]), v: new Float32Array([measured.v]), confidence: new Float32Array([1]) }
    const velocity = nowcastVelocity(field, { extent, baseTimeMs, model })
    const x = (latLonToWebMercator(lat, 25).x - extent.minX) / (extent.maxX - extent.minX)
    const at = (lead: number) => extentMotionToVelocity(velocity(x, 0.5, lead), lat, extent)
    expect(at(0).east).toBeCloseTo(12, 0)
    expect(at(0).north).toBeCloseTo(0, 0)
    // Two hours on, the model's southerly has taken over much of the flow.
    expect(at(120).north).toBeGreaterThan(8)
    expect(at(120).east).toBeLessThan(4)
  })

  test('renders a composite-sized frame quickly enough to draw on demand', () => {
    const base: RgbaImage = { width: 1024, height: 1192, data: new Uint8ClampedArray(1024 * 1192 * 4).fill(200) }
    const field = uniform(0.0002, 0.0001)
    const [displacement] = nowcastDisplacements(4, 4, 1, 5, (x, y) => sampleMotion(field, x, y))
    const started = performance.now()
    renderNowcastFrame(base, displacement, 4, 4, 512, 596, 2)
    expect(performance.now() - started).toBeLessThan(500)
  })
})
