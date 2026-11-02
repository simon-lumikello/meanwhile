import {
  NOWCAST_ANALYSIS_WIDTH,
  NOWCAST_FRAME_WIDTH,
  NOWCAST_MOTION_LAG_MINUTES,
  NOWCAST_STEP_MINUTES,
  createSteeringWindModel,
  extentFromBounds,
  extentMotionToVelocity,
  extentPositionToLatLon,
  nowcastBlurRadius,
  nowcastDisplacements,
  nowcastForecastTimes,
  nowcastHistoryTimes,
  nowcastVelocity,
  radarMotionEstimation,
  radarTracer,
  renderNowcastFrame,
  sampleMotion,
  steeringWindSamplePoints,
  surfaceWindToSteering,
  velocityToExtentMotion,
  velocityToWind,
  type RgbaImage,
  type TracerGrid,
} from './nowcast'
import { latLonToWebMercator } from './mercator'
import type { RadarFilterMode, RadarFrameSource, SteeringWindSample } from './types'

/** Where the forecast's motion came from, best first. */
export type RadarNowcastBasis = 'radar' | 'model' | 'surface-wind' | 'none'

export interface RadarNowcast {
  /** The latest scan the forecast starts from. */
  baseTime: string
  /** Forecast frame times, one step apart after the base scan. */
  times: string[]
  /** One rendered frame per time. */
  frames: ImageData[]
  /** How the rain moves at the observer, for a caption. */
  motion: { speedMs: number; directionDeg: number } | null
  basis: RadarNowcastBasis
}

export interface RadarNowcastRequest {
  source: RadarFrameSource
  filterMode: RadarFilterMode
  /** Scan times to try as the base, latest first; the first one available wins. */
  candidates: string[]
  minutes: number
  latitude: number
  longitude: number
  /** Surface wind, used as a rough steering flow when the source offers no model winds. */
  surfaceWind?: { speedMs: number; directionDeg: number }
  signal: AbortSignal
  /** How much of the work is done (0–1), reported as it goes. */
  onProgress?: (fraction: number) => void
}

/** Work per slice before yielding to the page, in milliseconds. */
const SLICE_MS = 12
/** Model winds are asked for from this long before the base scan. */
const WIND_HISTORY_MS = 2 * 60 * 60 * 1000

class AbortedError extends Error {}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new AbortedError()
}

/** Yields to the page between slices of work. */
function nextSlice(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 0)
    const abort = () => {
      clearTimeout(timer)
      reject(new AbortedError())
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const cleanup = () => {
      img.onload = null
      img.onerror = null
      signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      img.src = ''
      reject(new AbortedError())
    }
    img.crossOrigin = 'anonymous'
    img.onload = () => { cleanup(); resolve(img) }
    img.onerror = () => { cleanup(); reject(new Error(`Radar frame unavailable: ${url}`)) }
    signal.addEventListener('abort', abort, { once: true })
    img.src = url
  })
}

/** Pixels of an image, scaled to `width` wide. */
function readPixels(img: HTMLImageElement, width: number): RgbaImage {
  const height = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * width))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('No 2D canvas')
  context.drawImage(img, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  return { width, height, data }
}

/**
 * Builds a radar forecast: finds the latest scan, measures how echoes moved over the
 * hour before it, asks the source for model winds, then renders one forecast frame per
 * slice. Resolves once every frame is rendered, or with `null` when no scan loads.
 */
export async function runRadarNowcast(request: RadarNowcastRequest): Promise<RadarNowcast | null> {
  const { source, filterMode, candidates, signal } = request
  const frameUrl = (time: string) => source.frameUrl({ time, filterMode, purpose: 'playback' })
  // Loading scans and winds, measuring motion, and rendering frames take roughly these shares.
  const progress = (fraction: number) => request.onProgress?.(Math.min(1, Math.max(0, fraction)))
  try {
    const reference = candidates[0]
    if (!reference) return null
    const windsPromise: Promise<SteeringWindSample[]> = source.steeringWinds
      ? source.steeringWinds({
        points: steeringWindSamplePoints(request.latitude, request.longitude),
        start: new Date(Date.parse(reference) - WIND_HISTORY_MS).toISOString(),
        end: new Date(Date.parse(reference) + (request.minutes + 60) * 60_000).toISOString(),
        signal,
      }).catch(() => [])
      : Promise.resolve([])

    // The newest scan may still be processing; take the latest one that loads.
    const attempts = await Promise.allSettled(candidates.map(time => loadImage(frameUrl(time), signal)))
    throwIfAborted(signal)
    const baseIndex = attempts.findIndex(attempt => attempt.status === 'fulfilled')
    if (baseIndex < 0) return null
    const baseTime = candidates[baseIndex]
    const baseImage = (attempts[baseIndex] as PromiseFulfilledResult<HTMLImageElement>).value
    const times = nowcastForecastTimes(baseTime, request.minutes, NOWCAST_STEP_MINUTES)
    const frames: ImageData[] = []
    progress(0.1)
    const extent = extentFromBounds(source.extent3857)
    const observer = latLonToWebMercator(request.latitude, request.longitude)
    const observerX = (observer.x - extent.minX) / (extent.maxX - extent.minX)
    const observerY = (extent.maxY - observer.y) / (extent.maxY - extent.minY)

    // Earlier scans, one lag apart; only the unbroken run ending at the base is compared.
    const historyTimes = nowcastHistoryTimes(baseTime)
    const history = await Promise.allSettled(historyTimes.slice(0, -1).map(time => loadImage(frameUrl(time), signal)))
    const samples = await windsPromise
    throwIfAborted(signal)
    const images: HTMLImageElement[] = [baseImage]
    for (let index = history.length - 1; index >= 0; index--) {
      const attempt = history[index]
      if (attempt.status !== 'fulfilled') break
      images.unshift(attempt.value)
    }
    progress(0.2)

    const base = readPixels(baseImage, Math.min(NOWCAST_FRAME_WIDTH * 2, baseImage.naturalWidth))
    await nextSlice(signal)
    const tracers: TracerGrid[] = []
    for (const img of images) {
      const pixels = img === baseImage ? base : readPixels(img, base.width)
      tracers.push(radarTracer(pixels, pixels.width / NOWCAST_ANALYSIS_WIDTH))
      await nextSlice(signal)
    }

    const model = createSteeringWindModel(samples)
    const baseTimeMs = Date.parse(baseTime)
    const surface = request.surfaceWind && request.surfaceWind.speedMs > 0
      ? surfaceWindToSteering(request.surfaceWind.speedMs, request.surfaceWind.directionDeg)
      : null
    // Before measuring, expect the model's flow, or failing that the surface wind's.
    const prior = (x: number, y: number) => {
      const { latitude, longitude } = extentPositionToLatLon(extent, x, y)
      const velocity = model.at(latitude, longitude, baseTimeMs) ?? surface
      return velocity ? velocityToExtentMotion(velocity, latitude, extent) : { u: 0, v: 0 }
    }

    const estimation = radarMotionEstimation(tracers, { lagMinutes: NOWCAST_MOTION_LAG_MINUTES, prior })
    let sliceStart = performance.now()
    let result = estimation.next()
    let rows = 0
    const totalRows = Math.max(1, Math.ceil(tracers[0].height / 8))
    while (!result.done) {
      if (performance.now() - sliceStart > SLICE_MS) {
        progress(0.2 + 0.3 * (rows / totalRows))
        await nextSlice(signal)
        sliceStart = performance.now()
      }
      result = estimation.next()
      rows++
    }
    const field = result.value
    const velocity = nowcastVelocity(field, { extent, baseTimeMs, model })
    const displacements = nowcastDisplacements(field.cols, field.rows, times.length, NOWCAST_STEP_MINUTES, velocity)

    const measured = tracers.length > 1 && sampleMotion(field, observerX, observerY).confidence > 0.2
    const basis: RadarNowcastBasis = measured ? 'radar' : model.hasData ? 'model' : surface ? 'surface-wind' : 'none'
    const here = velocity(observerX, observerY, 0)
    const motion = velocityToWind(extentMotionToVelocity(here, request.latitude, extent))
    progress(0.5)

    const width = Math.min(NOWCAST_FRAME_WIDTH, base.width)
    const height = Math.round((base.height / base.width) * width)
    for (let index = 0; index < times.length; index++) {
      await nextSlice(signal)
      const lead = (index + 1) * NOWCAST_STEP_MINUTES
      const frame = renderNowcastFrame(base, displacements[index], field.cols, field.rows, width, height, nowcastBlurRadius(lead, width))
      frames.push(new ImageData(frame.data, frame.width, frame.height))
      progress(0.5 + 0.5 * ((index + 1) / times.length))
    }
    return { baseTime, times, frames, motion: basis === 'none' ? null : motion, basis }
  } catch (error) {
    if (error instanceof AbortedError || signal.aborted) return null
    console.warn('[RadarNowcast] Forecast unavailable:', error)
    return null
  }
}
