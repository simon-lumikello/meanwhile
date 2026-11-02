import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { CloudRadarCanvas } from '../../src/CloudRadarCanvas'
import { RadarFrameLoop } from '../../src/RadarFrameLoop'
import { createHomeCamera } from '../../src/camera'
import { getBoundingBox3857 } from '../../src/core'
import type { RadarFrameSource } from '../../src/types'
import { CLOUD_FIXTURE as fixture } from './fixture-config'

type Props = React.ComponentProps<typeof CloudRadarCanvas>
/**
 * Frames are supplied as URLs covering exactly the rendered view, like the captured WMS raster.
 * `cameraDeltaMeters` zooms the camera within that frame (default: the frame's own extent).
 */
type HarnessProps = Partial<Omit<Props, 'loop' | 'source'>> & {
  radarUrl?: string; playbackUrls?: string[]; deltaMeters?: number; cameraDeltaMeters?: number
}
const root = createRoot(document.getElementById('root')!)
let now = 0
let nextId = 0
const realNow = performance.now.bind(performance)
const callbacks = new Map<number, FrameRequestCallback>()
Object.defineProperty(performance, 'now', { value: () => now })
window.requestAnimationFrame = callback => {
  callbacks.set(++nextId, callback)
  return nextId
}
window.cancelAnimationFrame = id => { callbacks.delete(id) }

// Capture API work independently of machine speed. No instrumentation ships in the app.
const metrics = { draws: 0, uploads: 0, uniformLookups: 0 }
const morphLocations = new Map<WebGLProgram, WebGLUniformLocation | null>()
// The program last used that has a morph uniform: the classic, heatmap, or volumetric coverage pass.
let morphProgram: WebGLProgram | null = null
// WebGL2 draws volumetric clouds; WebGL1 (where WebGL2 is unavailable) the classic ones.
for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
  for (const [method, counter] of [
    ['drawArrays', 'draws'], ['texImage2D', 'uploads'], ['getUniformLocation', 'uniformLookups'], ['useProgram', null],
  ] as const) {
    const original = prototype[method] as (...args: unknown[]) => unknown
    Object.defineProperty(prototype, method, {
      value: function (...args: unknown[]) {
        if (counter) metrics[counter]++
        const result = Reflect.apply(original, this, args)
        if (method === 'getUniformLocation' && args[1] === 'u_morph') morphLocations.set(args[0] as WebGLProgram, result as WebGLUniformLocation | null)
        if (method === 'useProgram' && morphLocations.get(args[0] as WebGLProgram)) morphProgram = args[0] as WebGLProgram
        return result
      },
    })
  }
}

// Quantized ~1 km ground cells, projected at the configured latitude, then nearest-neighbour
// rasterized at the actual WMS output size. Never feed smooth blobs to the renderer.
function radarFixture(width: number, height: number, deltaMeters: number, shift = 0) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const cell = height * 1000 / (2 * deltaMeters * Math.cos(fixture.location.latitude * Math.PI / 180))
  const palette = ['#aca9ed', '#537bd8', '#14bfdc', '#18b55a', '#ecdf28', '#ee611b', '#c92128']
  for (let y = 0; y < height / cell; y++) {
    for (let x = 0; x < width / cell; x++) {
      const u = (x + 0.5) * cell / width - shift
      const v = (y + 0.5) * cell / height
      const jitter = ((Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263)) >>> 0) / 4294967296
      const storm = Math.exp(-((u - 0.55) ** 2 / 0.038 + (v - 0.47) ** 2 / 0.1))
      const front = Math.exp(-((u - 0.18 - v * 0.25) ** 2 / 0.012)) * 0.6
      const density = Math.max(storm, front) + (jitter - 0.5) * 0.2
      if (u > 0.9 && v < 0.16) ctx.fillStyle = '#bdbdbd' // OPERA no-data
      else if (density < 0.13) continue // transparent dry holes / sharp edges
      else ctx.fillStyle = palette[Math.min(6, Math.floor(density * 7))]
      const left = Math.round(x * cell)
      const top = Math.round(y * cell)
      ctx.fillRect(left, top, Math.round((x + 1) * cell) - left, Math.round((y + 1) * cell) - top)
    }
  }
  return canvas.toDataURL()
}

// Scattered showers, clustered around the center, of ~1 km ground cells in FMI's
// all-clouds ramp, at the live frame's resolution (~1.49 km per texel) over a view
// ±deltaMeters tall with the given aspect.
function showerFixture(deltaMeters: number, aspect: number) {
  const canvas = document.createElement('canvas')
  canvas.height = Math.round(2 * deltaMeters / 1490)
  canvas.width = Math.round(canvas.height * aspect)
  const ctx = canvas.getContext('2d')!
  const ramp = ['#e5d3f7', '#cdbff4', '#b1aff2', '#abadf2', '#97a6f0', '#82acef', '#6cbcee', '#56d4ed', '#5bedd2', '#d6ed40', '#e8d318', '#dcaf0d']
  let seed = 7
  const random = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9 | 0) >>> 0) / 4294967296
  const showers = Array.from({ length: 90 }, (_, i) => {
    const spread = i < 30 ? 0.16 : 1
    return { u: 0.5 + (random() - 0.5) * spread, v: 0.5 + (random() - 0.5) * spread,
      radius: 0.004 + random() ** 2 * 0.03, peak: 0.3 + random() * 0.7 }
  })
  const cell = canvas.height * 1000 / (2 * deltaMeters * Math.cos(fixture.location.latitude * Math.PI / 180))
  for (let y = 0; y < canvas.height / cell; y++) {
    for (let x = 0; x < canvas.width / cell; x++) {
      const u = (x + 0.5) * cell / canvas.width
      const v = (y + 0.5) * cell / canvas.height
      let density = 0
      for (const s of showers) {
        density = Math.max(density, s.peak * Math.exp(-(((u - s.u) * aspect) ** 2 + (v - s.v) ** 2) / s.radius ** 2))
      }
      density += (random() - 0.5) * 0.12
      if (density < 0.1) continue
      ctx.fillStyle = ramp[Math.min(ramp.length - 1, Math.floor(density * ramp.length))]
      const left = Math.round(x * cell)
      const top = Math.round(y * cell)
      ctx.fillRect(left, top, Math.round((x + 1) * cell) - left, Math.round((y + 1) * cell) - top)
    }
  }
  return canvas.toDataURL()
}

/**
 * Rain and storm tint (blue over red) of the central `fraction` of a rendered frame over
 * a neutral background, resampled to width × height: white clouds and bare ground read 0.
 * The same ground from renders at different zooms, for comparison.
 */
async function groundRain(png: string, fraction: number, width: number, height: number) {
  const data = await groundPixels(png, fraction, width, height, '#202020')
  return Array.from({ length: width * height }, (_, i) => Math.max(0, data[i * 4 + 2] - data[i * 4]) / 255)
}

/**
 * Blueness (blue less red, over luminance) of the cloud colour in the central `fraction` of
 * a rendered frame, resampled to width × height; null where cloud is not mostly opaque.
 * Rain cloud is the same cloud, darker and bluer, so it reads higher than dry cloud.
 */
async function groundTint(png: string, fraction: number, width: number, height: number) {
  const data = await groundPixels(png, fraction, width, height, null)
  return Array.from({ length: width * height }, (_, i) => {
    const alpha = data[i * 4 + 3] / 255
    if (alpha < 0.6) return null
    const [r, g, b] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]].map(value => value / 255 / alpha)
    return (b - r) / Math.max(0.05, 0.3 * r + 0.59 * g + 0.11 * b)
  })
}

/** Alpha of the central `fraction` of a rendered frame, resampled to width × height. */
async function groundAlpha(png: string, fraction: number, width: number, height: number) {
  const data = await groundPixels(png, fraction, width, height, null)
  return Array.from({ length: width * height }, (_, i) => data[i * 4 + 3] / 255)
}

async function groundPixels(png: string, fraction: number, width: number, height: number, background: string | null) {
  const image = new Image()
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = png })
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.imageSmoothingQuality = 'high'
  const w = image.width * fraction
  const h = image.height * fraction
  ctx.drawImage(image, (image.width - w) / 2, (image.height - h) / 2, w, h, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height).data
}

/** The renderer's context: getContext returns the existing one only for its own kind. */
function context(): WebGL2RenderingContext | WebGLRenderingContext {
  const canvas = document.querySelector('canvas')!
  return canvas.getContext('webgl2') ?? canvas.getContext('webgl')!
}

const { latitude, longitude } = fixture.location
const loop = new RadarFrameLoop(createHomeCamera(latitude, longitude, fixture.deltaMeters, fixture.width, fixture.height))
let source: RadarFrameSource | null = null

function sourceFor(radarUrl: string, playbackUrls: string[], timestamps: string[], deltaMeters: number, width: number, height: number): RadarFrameSource {
  const extent = getBoundingBox3857(latitude, longitude, deltaMeters, width / height).split(',').map(Number) as [number, number, number, number]
  const id = JSON.stringify([radarUrl, playbackUrls, timestamps, extent])
  if (source?.id !== id) {
    source = { id, extent3857: extent, frameUrl: ({ time }) => (time ? playbackUrls[timestamps.indexOf(time)] : radarUrl) }
  }
  return source
}

const harness = {
  metrics,
  radarFixture,
  showerFixture,
  groundRain,
  groundTint,
  groundAlpha,
  render({ radarUrl = new URL('./radar-capture.png', import.meta.url).href, playbackUrls = [], deltaMeters = fixture.deltaMeters,
    cameraDeltaMeters = deltaMeters, ...props }: HarnessProps = {},
    width: number = fixture.width, height: number = fixture.height) {
    loop.setCamera(createHomeCamera(latitude, longitude, cameraDeltaMeters, width, height))
    const frameSource = sourceFor(radarUrl, playbackUrls, props.playbackTimestamps ?? [], deltaMeters, width, height)
    flushSync(() => root.render(
      <div style={{ width, height }}>
        <CloudRadarCanvas loop={loop} source={frameSource} filterMode="clouds" mode="clouds"
          latitude={latitude} longitude={longitude} liveRefreshMs={0} {...props} />
      </div>,
    ))
  },
  step(time: number) {
    now = time
    const pending = [...callbacks.values()]
    callbacks.clear()
    pending.forEach(callback => callback(now))
    const gl = context()
    gl.finish()
    return { png: (gl.canvas as HTMLCanvasElement).toDataURL(), metrics: { ...metrics }, pending: callbacks.size, error: gl.getError(),
      morph: gl.getUniform(morphProgram!, morphLocations.get(morphProgram!)!) as number }
  },
  pendingFrames() { return callbacks.size },
  unmount() { flushSync(() => root.unmount()) },
  benchmark(iterations = 40) {
    const gl = context()
    const samples: number[] = []
    const pixel = new Uint8Array(4)
    for (let i = 0; i < iterations + 5; i++) {
      // Past every frame interval, so each step draws a frame.
      now += 1000
      const start = realNow()
      const pending = [...callbacks.values()]
      callbacks.clear()
      pending.forEach(callback => callback(now))
      // A tiny readback waits for GPU completion (Chromium can defer gl.finish).
      // Includes readback overhead, but excludes PNG encoding and screenshot work.
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      if (i >= 5) samples.push(realNow() - start)
    }
    samples.sort((a, b) => a - b)
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      medianMs: samples[Math.floor(samples.length / 2)],
      p95Ms: samples[Math.floor(samples.length * 0.95)],
      renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      browser: navigator.userAgent,
    }
  },
}
declare global { interface Window { cloudHarness: typeof harness } }
window.cloudHarness = harness
