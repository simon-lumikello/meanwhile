import { webMercatorToLatLon } from './camera'
import type { SteeringWindSample } from './types'

/**
 * A radar nowcast: how echoes moved over the last hour, measured by matching recent
 * scans against each other, carried forward along that motion. Where the radar shows
 * nothing to track, and increasingly as the forecast reaches further ahead, the motion
 * follows the model's steering winds, including the change they are forecast to make.
 * Echoes keep their shape and strength; they only move and, as certainty fades, blur.
 *
 * Positions and motion are in fractions of the frame extent (x east, y down the image),
 * so every step works at any image resolution.
 */

/** Minutes between radar scans and between forecast frames. */
export const NOWCAST_STEP_MINUTES = 5
/** Minutes between the scans compared to measure motion: long enough to move a few pixels. */
export const NOWCAST_MOTION_LAG_MINUTES = 15
/** Scan pairs the motion is measured over, so one noisy pair cannot steer the forecast. */
export const NOWCAST_MOTION_PAIRS = 4
/** Width of the grid motion is measured on; a quarter of a playback frame. */
export const NOWCAST_ANALYSIS_WIDTH = 256
/** Width of the forecast frames. */
export const NOWCAST_FRAME_WIDTH = 512
/** Default forecast length. */
export const NOWCAST_DEFAULT_MINUTES = 180

/**
 * Surface wind is slowed and backed by friction; the flow that carries rain is stronger and
 * veered: this many times faster, turned this many degrees clockwise.
 */
const SURFACE_TO_STEERING_SPEED = 2
const SURFACE_TO_STEERING_VEER_DEG = 20
/**
 * How far the forecast leans on the model's own wind rather than the measured motion: a
 * share growing with lead time, lead / MODEL_BLEND_MINUTES, and never past MODEL_BLEND_MAX.
 */
const MODEL_BLEND_MINUTES = 360
const MODEL_BLEND_MAX = 0.5
/** Blur added per hour of lead, in forecast-frame pixels, as the exact position grows uncertain. */
const BLUR_PX_PER_HOUR = 1

/** Motion in extent fractions per minute: u east, v down the image (south). */
export interface MotionVector {
  u: number
  v: number
}

/** A single-channel image of how much echo each pixel holds (0–1). */
export interface TracerGrid {
  width: number
  height: number
  data: Float32Array
}

/** RGBA pixels, not premultiplied, as canvas `ImageData` holds them. */
export interface RgbaImage {
  width: number
  height: number
  data: Uint8ClampedArray<ArrayBuffer>
}

/**
 * Motion on a coarse grid of nodes: node (c, r) sits at ((c + 0.5) / cols, (r + 0.5) / rows)
 * of the extent. Confidence (0–1) is how much of a node's motion the radar measured
 * rather than the fallback wind.
 */
export interface RadarMotionField {
  cols: number
  rows: number
  u: Float32Array
  v: Float32Array
  confidence: Float32Array
}

/** Frame extent size in EPSG:3857 meters, which turns winds into extent fractions. */
export interface NowcastExtent {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function extentFromBounds([minX, minY, maxX, maxY]: readonly [number, number, number, number]): NowcastExtent {
  return { minX, minY, maxX, maxY }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000

/** Scans the motion is measured from, oldest first, ending at the base scan. */
export function nowcastHistoryTimes(baseTime: string, pairs = NOWCAST_MOTION_PAIRS, lagMinutes = NOWCAST_MOTION_LAG_MINUTES): string[] {
  const base = Date.parse(baseTime)
  return Array.from({ length: pairs + 1 }, (_, index) => new Date(base - (pairs - index) * lagMinutes * MINUTE_MS).toISOString())
}

/** Forecast frame times after the base scan, one step apart, up to `minutes` ahead. */
export function nowcastForecastTimes(baseTime: string, minutes = NOWCAST_DEFAULT_MINUTES, stepMinutes = NOWCAST_STEP_MINUTES): string[] {
  const base = Date.parse(baseTime)
  return Array.from({ length: Math.max(0, Math.floor(minutes / stepMinutes)) }, (_, index) => new Date(base + (index + 1) * stepMinutes * MINUTE_MS).toISOString())
}

// ---------------------------------------------------------------------------
// Tracer
// ---------------------------------------------------------------------------

/**
 * How much echo each pixel shows, averaged down by `factor`. Any coloured, opaque pixel
 * counts; neutral grey is the no-data colour some radar palettes use and does not.
 */
export function radarTracer(image: RgbaImage, factor: number): TracerGrid {
  const step = Math.max(1, Math.round(factor))
  const width = Math.max(1, Math.floor(image.width / step))
  const height = Math.max(1, Math.floor(image.height / step))
  const data = new Float32Array(width * height)
  const { data: rgba, width: sourceWidth } = image
  const area = step * step
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let dy = 0; dy < step; dy++) {
        let offset = ((y * step + dy) * sourceWidth + x * step) * 4
        for (let dx = 0; dx < step; dx++, offset += 4) {
          const alpha = rgba[offset + 3]
          if (alpha < 5) continue
          const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2]
          const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
          sum += (alpha / 255) * smoothstep(0.02, 0.08, saturation)
        }
      }
      data[y * width + x] = sum / area
    }
  }
  return { width, height, data }
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export interface MotionEstimateOptions {
  /** Minutes between consecutive frames. */
  lagMinutes: number
  /** Expected motion at a position (extent fractions), used to centre the search and fill gaps. */
  prior?: (x: number, y: number) => MotionVector
  /** Tracer pixels between grid nodes. */
  cellSize?: number
  /** Side of the square window matched around each node, in tracer pixels. */
  window?: number
  /** How far around the expected displacement to search, in tracer pixels per lag. */
  searchRadius?: number
  /** Mean echo a window needs before its motion is measured. */
  minEcho?: number
}

const ZERO_MOTION: MotionVector = { u: 0, v: 0 }

/**
 * Block matching, as in TREC: each window of the later scan is found in the earlier one
 * by the smallest squared difference summed over every scan pair, refined to a fraction
 * of a pixel. Windows without echo, or whose match is ambiguous (a uniform rain shield
 * matches itself anywhere), carry little confidence; outliers are replaced by their
 * neighbours' median, and the field is smoothed into gaps, falling back to the prior.
 */
export function estimateRadarMotion(frames: TracerGrid[], options: MotionEstimateOptions): RadarMotionField {
  const estimation = radarMotionEstimation(frames, options)
  for (;;) {
    const next = estimation.next()
    if (next.done) return next.value
  }
}

/**
 * `estimateRadarMotion` one grid row at a time: it yields after each row, so a caller
 * can spread the work over several frames instead of blocking the page.
 */
export function* radarMotionEstimation(frames: TracerGrid[], options: MotionEstimateOptions): Generator<void, RadarMotionField> {
  const first = frames[0]
  const cellSize = options.cellSize ?? 8
  const windowSize = options.window ?? 16
  const radius = options.searchRadius ?? 4
  const minEcho = options.minEcho ?? 0.02
  const prior = options.prior ?? (() => ZERO_MOTION)
  const width = first?.width ?? 1
  const height = first?.height ?? 1
  const cols = Math.max(1, Math.ceil(width / cellSize))
  const rows = Math.max(1, Math.ceil(height / cellSize))
  const count = cols * rows
  const rawU = new Float32Array(count)
  const rawV = new Float32Array(count)
  const rawConfidence = new Float32Array(count)
  const priors: MotionVector[] = new Array(count)
  const lag = Math.max(1e-6, options.lagMinutes)
  const half = windowSize / 2
  const side = 2 * radius + 1
  const costs = new Float64Array(side * side)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const node = r * cols + c
      const nx = (c + 0.5) / cols
      const ny = (r + 0.5) / rows
      const expected = prior(nx, ny)
      priors[node] = expected
      if (frames.length < 2) continue
      const cx = Math.round(nx * width)
      const cy = Math.round(ny * height)
      const x0 = Math.max(0, cx - half), x1 = Math.min(width, cx + half)
      const y0 = Math.max(0, cy - half), y1 = Math.min(height, cy + half)
      const pixels = (x1 - x0) * (y1 - y0)
      if (pixels <= 0) continue

      // Enough echo, with some structure to follow, in the later scans.
      let echo = 0
      let echoSquared = 0
      for (let pair = 1; pair < frames.length; pair++) {
        const data = frames[pair].data
        for (let y = y0; y < y1; y++) for (let x = x0, i = y * width + x0; x < x1; x++, i++) { echo += data[i]; echoSquared += data[i] * data[i] }
      }
      const samples = pixels * (frames.length - 1)
      const mean = echo / samples
      if (mean < minEcho) continue
      const variance = Math.max(0, echoSquared / samples - mean * mean)

      const baseDx = Math.round(expected.u * width * lag)
      const baseDy = Math.round(expected.v * height * lag)
      let best = Infinity
      let bestIndex = 0
      let total = 0
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          const dx = baseDx + ox
          const dy = baseDy + oy
          let cost = 0
          // Most windows stay inside the frame when shifted; only edge windows check bounds.
          const inside = x0 - dx >= 0 && x1 - dx <= width && y0 - dy >= 0 && y1 - dy <= height
          const shift = dy * width + dx
          for (let pair = 1; pair < frames.length && cost < best; pair++) {
            const later = frames[pair].data
            const earlier = frames[pair - 1].data
            for (let y = y0; y < y1; y++) {
              const rowEnd = y * width + x1
              if (inside) {
                for (let i = y * width + x0; i < rowEnd; i++) {
                  const difference = later[i] - earlier[i - shift]
                  cost += difference * difference
                }
                continue
              }
              const sy = y - dy
              const inRow = sy >= 0 && sy < height
              for (let x = x0, i = y * width + x0; x < x1; x++, i++) {
                const sx = x - dx
                const previous = inRow && sx >= 0 && sx < width ? earlier[sy * width + sx] : 0
                const difference = later[i] - previous
                cost += difference * difference
              }
            }
          }
          const index = (oy + radius) * side + (ox + radius)
          costs[index] = cost
          total += cost
          if (cost < best) { best = cost; bestIndex = index }
        }
      }
      // Early exits leave partial sums above the best, which only make the mean conservative.
      const meanCost = total / costs.length
      const bx = (bestIndex % side) - radius
      const by = Math.floor(bestIndex / side) - radius
      const refine = (minus: number, centre: number, plus: number) => {
        const curvature = minus - 2 * centre + plus
        return curvature > 1e-9 ? clamp((minus - plus) / (2 * curvature), -0.5, 0.5) : 0
      }
      const onEdge = Math.abs(bx) === radius || Math.abs(by) === radius
      const fx = onEdge ? 0 : refine(costs[bestIndex - 1], best, costs[bestIndex + 1])
      const fy = onEdge ? 0 : refine(costs[bestIndex - side], best, costs[bestIndex + side])
      const dx = baseDx + bx + fx
      const dy = baseDy + by + fy
      const sharpness = meanCost > 1e-9 ? (meanCost - best) / meanCost : 0
      const structure = smoothstep(0.002, 0.03, variance)
      rawU[node] = dx / width / lag
      rawV[node] = dy / height / lag
      rawConfidence[node] = clamp(sharpness * 1.5, 0, 1) * structure * smoothstep(minEcho, minEcho * 4, mean) * (onEdge ? 0.3 : 1)
    }
    yield
  }

  rejectOutliers(rawU, rawV, rawConfidence, cols, rows, 1.5 / width / lag, 1.5 / height / lag)
  return spreadMotion(rawU, rawV, rawConfidence, priors, cols, rows)
}

/** Replaces vectors far from their neighbours' median with it, at reduced confidence. */
function rejectOutliers(u: Float32Array, v: Float32Array, confidence: Float32Array, cols: number, rows: number, toleranceU: number, toleranceV: number) {
  const nextU = Float32Array.from(u)
  const nextV = Float32Array.from(v)
  const nextConfidence = Float32Array.from(confidence)
  const us: number[] = []
  const vs: number[] = []
  const median = (values: number[]) => {
    values.sort((a, b) => a - b)
    const middle = values.length >> 1
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const node = r * cols + c
      if (confidence[node] <= 0) continue
      us.length = 0
      vs.length = 0
      for (let nr = Math.max(0, r - 1); nr <= Math.min(rows - 1, r + 1); nr++) {
        for (let nc = Math.max(0, c - 1); nc <= Math.min(cols - 1, c + 1); nc++) {
          const neighbour = nr * cols + nc
          if (confidence[neighbour] <= 0) continue
          us.push(u[neighbour])
          vs.push(v[neighbour])
        }
      }
      if (us.length < 3) continue
      const mu = median(us)
      const mv = median(vs)
      if (Math.abs(u[node] - mu) > toleranceU || Math.abs(v[node] - mv) > toleranceV) {
        nextU[node] = mu
        nextV[node] = mv
        nextConfidence[node] = confidence[node] * 0.5
      }
    }
  }
  u.set(nextU)
  v.set(nextV)
  confidence.set(nextConfidence)
}

/** Gaussian-weighted spread of measured motion over the grid, falling back to the prior. */
function spreadMotion(u: Float32Array, v: Float32Array, confidence: Float32Array, priors: MotionVector[], cols: number, rows: number): RadarMotionField {
  const sigma = 2
  const reach = 5
  const priorWeight = 0.15
  const count = cols * rows
  const field: RadarMotionField = { cols, rows, u: new Float32Array(count), v: new Float32Array(count), confidence: new Float32Array(count) }
  const kernel = Array.from({ length: reach + 1 }, (_, d) => Math.exp(-(d * d) / (2 * sigma * sigma)))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const node = r * cols + c
      let weight = 0, su = 0, sv = 0
      for (let nr = Math.max(0, r - reach); nr <= Math.min(rows - 1, r + reach); nr++) {
        const wr = kernel[Math.abs(nr - r)]
        for (let nc = Math.max(0, c - reach); nc <= Math.min(cols - 1, c + reach); nc++) {
          const neighbour = nr * cols + nc
          const w = wr * kernel[Math.abs(nc - c)] * confidence[neighbour]
          if (w <= 0) continue
          weight += w
          su += w * u[neighbour]
          sv += w * v[neighbour]
        }
      }
      const expected = priors[node] ?? ZERO_MOTION
      const total = weight + priorWeight
      field.u[node] = (su + priorWeight * expected.u) / total
      field.v[node] = (sv + priorWeight * expected.v) / total
      field.confidence[node] = weight / total
    }
  }
  return field
}

/** Bilinear value of a node grid at an extent position. */
function sampleGrid(values: Float32Array, cols: number, rows: number, x: number, y: number): number {
  const gx = clamp(x * cols - 0.5, 0, cols - 1)
  const gy = clamp(y * rows - 0.5, 0, rows - 1)
  const c0 = Math.floor(gx), r0 = Math.floor(gy)
  const c1 = Math.min(cols - 1, c0 + 1), r1 = Math.min(rows - 1, r0 + 1)
  const tx = gx - c0, ty = gy - r0
  const top = values[r0 * cols + c0] * (1 - tx) + values[r0 * cols + c1] * tx
  const bottom = values[r1 * cols + c0] * (1 - tx) + values[r1 * cols + c1] * tx
  return top * (1 - ty) + bottom * ty
}

export function sampleMotion(field: RadarMotionField, x: number, y: number): MotionVector & { confidence: number } {
  return {
    u: sampleGrid(field.u, field.cols, field.rows, x, y),
    v: sampleGrid(field.v, field.cols, field.rows, x, y),
    confidence: sampleGrid(field.confidence, field.cols, field.rows, x, y),
  }
}

// ---------------------------------------------------------------------------
// Winds
// ---------------------------------------------------------------------------

/** Wind as a ground velocity in m/s: east and north components of where it blows to. */
export interface GroundVelocity {
  east: number
  north: number
}

/** Meteorological wind (speed, the direction it blows from) as the velocity it carries things with. */
export function windToVelocity(speedMs: number, directionDeg: number): GroundVelocity {
  const angle = (directionDeg * Math.PI) / 180
  return { east: -Math.sin(angle) * speedMs, north: -Math.cos(angle) * speedMs }
}

/** The reverse: speed and the direction the flow comes from. */
export function velocityToWind({ east, north }: GroundVelocity): { speedMs: number; directionDeg: number } {
  const speedMs = Math.hypot(east, north)
  const directionDeg = speedMs < 1e-9 ? 0 : ((Math.atan2(-east, -north) * 180) / Math.PI + 360) % 360
  return { speedMs, directionDeg }
}

/** The steering flow a surface wind suggests: faster, and veered clockwise. */
export function surfaceWindToSteering(speedMs: number, directionDeg: number): GroundVelocity {
  return windToVelocity(speedMs * SURFACE_TO_STEERING_SPEED, directionDeg + SURFACE_TO_STEERING_VEER_DEG)
}

/**
 * Ground velocity at a latitude as extent fractions per minute. Web Mercator stretches
 * ground distances by 1 / cos(latitude); image y grows southwards.
 */
export function velocityToExtentMotion(velocity: GroundVelocity, latitude: number, extent: NowcastExtent): MotionVector {
  const stretch = 1 / Math.cos((clamp(latitude, -85, 85) * Math.PI) / 180)
  return {
    u: (velocity.east * stretch * 60) / (extent.maxX - extent.minX),
    v: (-velocity.north * stretch * 60) / (extent.maxY - extent.minY),
  }
}

/** The reverse of `velocityToExtentMotion`. */
export function extentMotionToVelocity(motion: MotionVector, latitude: number, extent: NowcastExtent): GroundVelocity {
  const shrink = Math.cos((clamp(latitude, -85, 85) * Math.PI) / 180)
  return {
    east: (motion.u * (extent.maxX - extent.minX) * shrink) / 60,
    north: (-motion.v * (extent.maxY - extent.minY) * shrink) / 60,
  }
}

/** Latitude and longitude at an extent position. */
export function extentPositionToLatLon(extent: NowcastExtent, x: number, y: number) {
  return webMercatorToLatLon(extent.minX + x * (extent.maxX - extent.minX), extent.maxY - y * (extent.maxY - extent.minY))
}

/** Model winds interpolated in time at each place, then across places by inverse distance. */
export interface SteeringWindModel {
  readonly hasData: boolean
  at(latitude: number, longitude: number, timeMs: number): GroundVelocity | null
}

export function createSteeringWindModel(samples: readonly SteeringWindSample[]): SteeringWindModel {
  const places = new Map<string, { latitude: number; longitude: number; series: Array<{ time: number } & GroundVelocity> }>()
  for (const sample of samples) {
    const time = Date.parse(sample.time)
    if (![sample.latitude, sample.longitude, sample.speedMs, sample.directionDeg, time].every(Number.isFinite)) continue
    const key = `${sample.latitude.toFixed(3)},${sample.longitude.toFixed(3)}`
    const place = places.get(key) ?? { latitude: sample.latitude, longitude: sample.longitude, series: [] }
    place.series.push({ time, ...windToVelocity(sample.speedMs, sample.directionDeg) })
    places.set(key, place)
  }
  const list = [...places.values()]
  list.forEach(place => place.series.sort((a, b) => a.time - b.time))

  const atTime = (series: Array<{ time: number } & GroundVelocity>, time: number): GroundVelocity => {
    if (time <= series[0].time) return series[0]
    const last = series[series.length - 1]
    if (time >= last.time) return last
    let index = 1
    while (series[index].time < time) index++
    const a = series[index - 1], b = series[index]
    const t = (time - a.time) / (b.time - a.time)
    return { east: a.east + (b.east - a.east) * t, north: a.north + (b.north - a.north) * t }
  }

  return {
    hasData: list.length > 0,
    at(latitude, longitude, timeMs) {
      if (!list.length) return null
      let weight = 0, east = 0, north = 0
      const lonScale = Math.cos((latitude * Math.PI) / 180)
      for (const place of list) {
        const distance = Math.hypot(place.latitude - latitude, (place.longitude - longitude) * lonScale)
        const velocity = atTime(place.series, timeMs)
        if (distance < 1e-6) return velocity
        const w = 1 / (distance * distance)
        weight += w
        east += w * velocity.east
        north += w * velocity.north
      }
      return { east: east / weight, north: north / weight }
    },
  }
}

/** Places to ask for model winds: a small grid around the observer, kept inside the model domain. */
export function steeringWindSamplePoints(latitude: number, longitude: number, bounds = { minLat: 54, maxLat: 71, minLon: 5, maxLon: 36 }) {
  const points: Array<{ latitude: number; longitude: number }> = []
  for (const dLat of [-2, 0, 2]) {
    for (const dLon of [-4, 0, 4]) {
      points.push({
        latitude: Math.round(clamp(latitude + dLat, bounds.minLat, bounds.maxLat) * 100) / 100,
        longitude: Math.round(clamp(longitude + dLon, bounds.minLon, bounds.maxLon) * 100) / 100,
      })
    }
  }
  return points.filter((point, index) => points.findIndex(other => other.latitude === point.latitude && other.longitude === point.longitude) === index)
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export interface NowcastVelocityOptions {
  extent: NowcastExtent
  /** Base scan time, epoch milliseconds. */
  baseTimeMs: number
  model?: SteeringWindModel
}

/**
 * Motion at a position and lead time: the measured motion, turned and sped up by the
 * change the model forecasts, leaning further on the model the longer the lead.
 */
export function nowcastVelocity(field: RadarMotionField, { extent, baseTimeMs, model }: NowcastVelocityOptions) {
  const modelAt = (x: number, y: number, leadMinutes: number): MotionVector | null => {
    if (!model?.hasData) return null
    const { latitude, longitude } = extentPositionToLatLon(extent, x, y)
    const velocity = model.at(latitude, longitude, baseTimeMs + leadMinutes * MINUTE_MS)
    return velocity ? velocityToExtentMotion(velocity, latitude, extent) : null
  }
  return (x: number, y: number, leadMinutes: number): MotionVector => {
    const measured = sampleMotion(field, x, y)
    const now = modelAt(x, y, 0)
    const later = modelAt(x, y, leadMinutes)
    if (!now || !later) return measured
    const blend = Math.min(MODEL_BLEND_MAX, leadMinutes / MODEL_BLEND_MINUTES)
    return {
      u: (1 - blend) * (measured.u + later.u - now.u) + blend * later.u,
      v: (1 - blend) * (measured.v + later.v - now.v) + blend * later.v,
    }
  }
}

/**
 * Backward displacements on the motion grid for each forecast step: where the echo
 * that reaches a node after k steps was in the base scan. Each step traces one step
 * back along the flow at its midpoint, then continues from there with the previous
 * step's displacement, so a trajectory bends as the flow does.
 */
export function nowcastDisplacements(
  cols: number,
  rows: number,
  steps: number,
  stepMinutes: number,
  velocity: (x: number, y: number, leadMinutes: number) => MotionVector,
): Float32Array[] {
  const count = cols * rows
  const series: Float32Array[] = []
  let previous = new Float32Array(count * 2)
  const previousU = new Float32Array(count)
  const previousV = new Float32Array(count)
  for (let step = 1; step <= steps; step++) {
    const lead = step * stepMinutes
    const current = new Float32Array(count * 2)
    for (let node = 0; node < count; node++) {
      previousU[node] = previous[node * 2]
      previousV[node] = previous[node * 2 + 1]
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const node = r * cols + c
        const x = (c + 0.5) / cols
        const y = (r + 0.5) / rows
        const first = velocity(x, y, lead)
        const mid = velocity(x - first.u * stepMinutes / 2, y - first.v * stepMinutes / 2, lead - stepMinutes / 2)
        const bx = x - mid.u * stepMinutes
        const by = y - mid.v * stepMinutes
        current[node * 2] = mid.u * stepMinutes + (step > 1 ? sampleGrid(previousU, cols, rows, bx, by) : 0)
        current[node * 2 + 1] = mid.v * stepMinutes + (step > 1 ? sampleGrid(previousV, cols, rows, bx, by) : 0)
      }
    }
    series.push(current)
    previous = current
  }
  return series
}

/** Blur radius, in forecast-frame pixels, for a lead time. */
export function nowcastBlurRadius(leadMinutes: number, frameWidth = NOWCAST_FRAME_WIDTH): number {
  return Math.round((leadMinutes / 60) * BLUR_PX_PER_HOUR * (frameWidth / NOWCAST_FRAME_WIDTH))
}

/**
 * One forecast frame: every pixel samples the base scan where its echo came from,
 * then the frame is blurred by `blurRadius`. Colours are interpolated premultiplied,
 * so an echo's edge fades out instead of darkening.
 */
export function renderNowcastFrame(
  base: RgbaImage,
  displacement: Float32Array,
  cols: number,
  rows: number,
  width: number,
  height: number,
  blurRadius = 0,
): RgbaImage {
  // Each column's place between grid nodes is the same on every row.
  const column0 = new Int32Array(width)
  const column1 = new Int32Array(width)
  const columnT = new Float32Array(width)
  for (let x = 0; x < width; x++) {
    const gx = clamp(((x + 0.5) / width) * cols - 0.5, 0, cols - 1)
    column0[x] = Math.floor(gx)
    column1[x] = Math.min(cols - 1, column0[x] + 1)
    columnT[x] = gx - column0[x]
  }
  const rowU = new Float32Array(cols)
  const rowV = new Float32Array(cols)
  const premultiplied = new Float32Array(width * height * 4)
  const { data: src, width: sw, height: sh } = base
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) / height
    const gy = clamp(fy * rows - 0.5, 0, rows - 1)
    const r0 = Math.floor(gy)
    const r1 = Math.min(rows - 1, r0 + 1)
    const ty = gy - r0
    for (let c = 0; c < cols; c++) {
      const a = (r0 * cols + c) * 2, b = (r1 * cols + c) * 2
      rowU[c] = displacement[a] + (displacement[b] - displacement[a]) * ty
      rowV[c] = displacement[a + 1] + (displacement[b + 1] - displacement[a + 1]) * ty
    }
    for (let x = 0; x < width; x++) {
      const c0 = column0[x], c1 = column1[x], tx = columnT[x]
      const sx = ((x + 0.5) / width - (rowU[c0] + (rowU[c1] - rowU[c0]) * tx)) * sw - 0.5
      const sy = (fy - (rowV[c0] + (rowV[c1] - rowV[c0]) * tx)) * sh - 0.5
      if (sx <= -1 || sy <= -1 || sx >= sw || sy >= sh) continue
      const x0 = Math.floor(sx), y0 = Math.floor(sy)
      const fx = sx - x0, fy0 = sy - y0
      const out = (y * width + x) * 4
      for (let corner = 0; corner < 4; corner++) {
        const px = x0 + (corner & 1)
        const py = y0 + (corner >> 1)
        if (px < 0 || py < 0 || px >= sw || py >= sh) continue
        const i = (py * sw + px) * 4
        const a = src[i + 3] * ((corner & 1) ? fx : 1 - fx) * ((corner >> 1) ? fy0 : 1 - fy0)
        if (a === 0) continue
        premultiplied[out] += src[i] * a
        premultiplied[out + 1] += src[i + 1] * a
        premultiplied[out + 2] += src[i + 2] * a
        premultiplied[out + 3] += a
      }
    }
  }
  if (blurRadius > 0) boxBlur(premultiplied, width, height, blurRadius)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    const alpha = premultiplied[i + 3]
    if (alpha < 0.5) continue
    data[i] = premultiplied[i] / alpha
    data[i + 1] = premultiplied[i + 1] / alpha
    data[i + 2] = premultiplied[i + 2] / alpha
    data[i + 3] = alpha
  }
  return { width, height, data }
}

/** Separable box blur of four interleaved channels, in place. */
function boxBlur(pixels: Float32Array, width: number, height: number, radius: number) {
  const line = new Float32Array(Math.max(width, height) * 4)
  const span = 2 * radius + 1
  // One line at a time: `start` is its first pixel's offset, `stride` the offset between pixels.
  const blurLine = (start: number, stride: number, length: number) => {
    for (let p = 0, i = start; p < length; p++, i += stride) {
      line[p * 4] = pixels[i]
      line[p * 4 + 1] = pixels[i + 1]
      line[p * 4 + 2] = pixels[i + 2]
      line[p * 4 + 3] = pixels[i + 3]
    }
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0
    for (let p = 0; p <= Math.min(radius, length - 1); p++) {
      s0 += line[p * 4]; s1 += line[p * 4 + 1]; s2 += line[p * 4 + 2]; s3 += line[p * 4 + 3]
    }
    for (let p = 0, i = start; p < length; p++, i += stride) {
      pixels[i] = s0 / span
      pixels[i + 1] = s1 / span
      pixels[i + 2] = s2 / span
      pixels[i + 3] = s3 / span
      const leaving = (p - radius) * 4
      const entering = (p + radius + 1) * 4
      if (leaving >= 0) { s0 -= line[leaving]; s1 -= line[leaving + 1]; s2 -= line[leaving + 2]; s3 -= line[leaving + 3] }
      if (entering < length * 4) { s0 += line[entering]; s1 += line[entering + 1]; s2 += line[entering + 2]; s3 += line[entering + 3] }
    }
  }
  for (let y = 0; y < height; y++) blurLine(y * width * 4, 4, width)
  for (let x = 0; x < width; x++) blurLine(x * 4, width * 4, height)
}
