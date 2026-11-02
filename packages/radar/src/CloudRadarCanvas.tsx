import React, { useEffect, useRef, useState } from 'react'
import { getCelestialLightSource } from '@simon-lumikello/meanwhile-weather/core'
import { cloudFrameRate } from './cloudFrameRate'
import { cloudLightingSun, volumeFrame } from './cloudLighting'
import { nearestReadyFrame, playheadTime } from './playback'
import { FS_SOURCE, HEATMAP_FS_SOURCE, VS_SOURCE } from './cloudShaders'
import { CLOUD_RENDER_POLICY, CLOUD_VISUAL_TUNING, CLOUD_VOLUME_TUNING } from './cloudVisualTuning'
import { projectToCamera } from './camera'
import { latLonToWebMercator } from './mercator'
import { VolumetricClouds } from './volumetricClouds'
import { computeNoiseLevel } from './worldNoise'
import type { RadarFrame, RadarFrameLoop } from './RadarFrameLoop'
import type { RadarCloudLighting, RadarFilterMode, RadarFrameSource } from './types'

/**
 * Viewport height, in EPSG:3857 meters, the renderer's art direction was tuned at
 * (the 'close' preset). Ground-anchored motion and offsets keep that pace at every zoom.
 */
const REFERENCE_SPAN_METERS = 40000
/** Smallest rain and storm sampling radius, in output pixels. */
const RAIN_RADIUS_MIN_PIXELS = 8
/**
 * Smallest radius, in output pixels, the volumetric clouds read the radar over: when zoomed
 * out, wide enough to round off radar cells and ramp cloud edges over several pixels.
 */
const VOLUME_RADIUS_MIN_PIXELS = 16
/** Default for `liveRefreshMs`: how often the latest scan is asked for again, matching FMI's scan interval. */
const LIVE_REFRESH_MS = 5 * 60 * 1000
/** How often the clock is checked for a new refresh slot, so a slept tab catches up soon after waking. */
const LIVE_REFRESH_CHECK_MS = 30 * 1000
/** Playback frames loaded at once. */
const PLAYBACK_PRELOAD_CONCURRENCY = 6

export type RadarLayerStatus = 'loading' | 'ready' | 'error'

/** Rendered forecast frames that continue a playback sequence. */
export interface RadarForecastFrames {
  /** Index into the playback timestamps of the first forecast frame. */
  startIndex: number
  frames: ReadonlyArray<ImageData | undefined>
}

type RadarFrameImage = HTMLImageElement | ImageData

export interface CloudRadarCanvasProps {
  loop: RadarFrameLoop
  source: RadarFrameSource
  filterMode: RadarFilterMode
  /** Procedural clouds, or the radar's own colors as a heatmap. */
  mode: 'clouds' | 'heatmap'
  /** Opacity of the clouds and their shadows (0–1), so the map shows through heavy weather. Not applied to the heatmap. */
  cloudOpacity?: number
  className?: string
  isDark?: boolean
  latitude: number
  longitude: number
  windSpeedMs?: number
  windDirectionDeg?: number
  /**
   * How echoes move, measured from recent scans (the nowcast's motion). Morphs slide both
   * frames along it; without it they follow a guess from the surface wind.
   */
  echoMotion?: { speedMs: number; directionDeg: number } | null
  morphDurationMs?: number
  isPlaying?: boolean
  playbackTime?: string | null
  playbackTimestamps?: string[]
  /** Forecast frames for the playback timestamps from `startIndex` on; missing ones are still rendering. */
  forecast?: RadarForecastFrames
  /** How often the latest scan is requested again; 0 turns live refresh off. */
  liveRefreshMs?: number
  /** Changing it retries a failed live frame. */
  retryKey?: number
  onStatusChange?: (status: RadarLayerStatus) => void
  /** Lights the clouds as the sun stands now, or always as at midday. */
  cloudLighting?: RadarCloudLighting
}

type UniformMap = Record<string, WebGLUniformLocation | null>

interface ProgramInfo {
  program: WebGLProgram
  uniforms: UniformMap
  position: number
}

const CLOUD_UNIFORMS = [
  'u_texPrev', 'u_texNext', 'u_morph', 'u_viewOrigin', 'u_viewSize', 'u_texOrigin', 'u_texSize',
  'u_levelMeters', 'u_levelT', 'u_octave', 'u_isNight', 'u_drift', 'u_shadowOffset',
  'u_advection', 'u_blurRadius', 'u_rainRadius', 'u_shadowStrength', 'u_lightDir',
]
const HEATMAP_UNIFORMS = [
  'u_texPrev', 'u_texNext', 'u_morph', 'u_viewOrigin', 'u_viewSize', 'u_texOrigin', 'u_texSize',
  'u_texResolution', 'u_pixelsPerTexel', 'u_opacity',
]

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, fsSource: string, uniformNames: string[]): ProgramInfo | null {
  const vs = createShader(gl, gl.VERTEX_SHADER, VS_SOURCE)
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource)
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
    return null
  }

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return null
  }
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.detachShader(program, vs)
  gl.detachShader(program, fs)
  gl.deleteShader(vs)
  gl.deleteShader(fs)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  // Uniform locations belong to the linked program, not the animation frame.
  const uniforms = Object.fromEntries(uniformNames.map(name => [name, gl.getUniformLocation(program, name)]))
  return { program, uniforms, position: gl.getAttribLocation(program, 'a_position') }
}

function createSolidTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const texture = gl.createTexture()
  if (!texture) return null
  gl.bindTexture(gl.TEXTURE_2D, texture)
  // 1x1 transparent pixel
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return texture
}

const isLoaded = (img: HTMLImageElement | null | undefined): img is HTMLImageElement => Boolean(img && img.complete && img.naturalWidth > 0)
const frameSize = (frame: RadarFrameImage): [number, number] =>
  frame instanceof HTMLImageElement ? [frame.naturalWidth, frame.naturalHeight] : [frame.width, frame.height]

/** Screen-space (y down) wind drift of the classic renderer, in viewport heights per second. */
function screenWind(speedMs: number, directionDeg: number) {
  // Surface winds are typically ~3x slower than 850hPa steering winds that move precipitation clouds.
  const steeringSpeed = speedMs * 3.0
  const speedScale = steeringSpeed * 0.00015
  const angle = (directionDeg * Math.PI) / 180
  // Meteorological direction is where the wind comes FROM: 0° blows south, down the screen.
  const x = -Math.sin(angle) * speedScale
  const y = Math.cos(angle) * speedScale
  return { steeringSpeed, angle, x, y }
}

/** How far echoes move between two frames `frameSeconds` apart, in Web Mercator meters (y north). */
function advectionVector(
  echoMotion: { speedMs: number; directionDeg: number } | null | undefined,
  wind: { steeringSpeed: number; angle: number },
  mercatorScale: number,
  frameSeconds: number,
): [number, number] {
  // The surface-wind guess is tuned in map meters already.
  const [speed, angle] = echoMotion
    ? [echoMotion.speedMs * mercatorScale, (echoMotion.directionDeg * Math.PI) / 180]
    : [wind.steeringSpeed, wind.angle]
  const distance = speed * frameSeconds
  // Directions are where the flow comes FROM.
  return [-Math.sin(angle) * distance, -Math.cos(angle) * distance]
}

export const CloudRadarCanvas: React.FC<CloudRadarCanvasProps> = ({
  loop,
  source,
  filterMode,
  mode,
  cloudOpacity = 1,
  className = '',
  isDark = true,
  latitude,
  longitude,
  windSpeedMs = 0,
  windDirectionDeg = 0,
  echoMotion,
  morphDurationMs = 3500,
  isPlaying = false,
  playbackTime,
  playbackTimestamps,
  forecast,
  liveRefreshMs = LIVE_REFRESH_MS,
  retryKey = 0,
  onStatusChange,
  cloudLighting = 'time-of-day',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fallbackRef = useRef<HTMLImageElement | null>(null)
  const [hasWebGL, setHasWebGL] = useState<boolean>(true)
  const [liveSlot, setLiveSlot] = useState(() => Math.floor(Date.now() / Math.max(1, liveRefreshMs)))

  // The render loop reads the latest props through one ref instead of re-subscribing.
  const propsRef = useRef({ source, mode, isDark, latitude, longitude, windSpeedMs, windDirectionDeg, echoMotion, morphDurationMs, isPlaying, playbackTime, playbackTimestamps, forecast, cloudLighting })
  const statusRef = useRef(onStatusChange)
  useEffect(() => {
    propsRef.current = { source, mode, isDark, latitude, longitude, windSpeedMs, windDirectionDeg, echoMotion, morphDurationMs, isPlaying, playbackTime, playbackTimestamps, forecast, cloudLighting }
    statusRef.current = onStatusChange
    loop.request()
  }, [loop, source, mode, isDark, latitude, longitude, windSpeedMs, windDirectionDeg, echoMotion, morphDurationMs, isPlaying, playbackTime, playbackTimestamps, forecast, cloudLighting, onStatusChange])

  // WebGL references
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const texPrevRef = useRef<WebGLTexture | null>(null)
  const texNextRef = useRef<WebGLTexture | null>(null)
  const texResolutionRef = useRef<[number, number]>([1, 1])
  const morphStartRef = useRef<number>(0)
  const hasFrameRef = useRef(false)
  const liveUrlRef = useRef('')

  // Continuous playback references. Scans are cached by time, so a forecast joining
  // the timeline, or the day's list growing, never reloads the scans already here.
  const internalPlayheadRef = useRef<number>(0)
  const scanCacheRef = useRef({ key: '', scans: new Map<string, HTMLImageElement | null>() })
  // The frames currently in each texture, so advancing only swaps them.
  const lastBoundPrevRef = useRef<RadarFrameImage | null>(null)
  const lastBoundNextRef = useRef<RadarFrameImage | null>(null)

  const timelineActive = Boolean(playbackTimestamps?.length) && (isPlaying || (playbackTime !== undefined && playbackTime !== null))
  const observedTimestamps = forecast ? playbackTimestamps?.slice(0, forecast.startIndex) : playbackTimestamps
  const timestampsKey = observedTimestamps?.join('|') ?? ''

  // The latest scan is requested again every refresh period while the page is visible.
  useEffect(() => {
    if (liveRefreshMs <= 0) return
    const check = () => {
      if (document.visibilityState === 'hidden') return
      setLiveSlot(Math.floor(Date.now() / liveRefreshMs))
    }
    const interval = setInterval(check, Math.min(LIVE_REFRESH_CHECK_MS, liveRefreshMs))
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', check)
    }
  }, [liveRefreshMs])

  // Parallel preloading keeps network work out of the animation loop.
  useEffect(() => {
    const timestamps = timestampsKey ? timestampsKey.split('|') : []
    const cacheKey = `${source.id}|${filterMode}`
    if (scanCacheRef.current.key !== cacheKey) scanCacheRef.current = { key: cacheKey, scans: new Map() }
    const { scans } = scanCacheRef.current
    const wanted = new Set(timestamps)
    for (const time of scans.keys()) if (!wanted.has(time)) scans.delete(time)
    // Newest first: playing from Now starts in the last hour, well before the morning is needed.
    const missing = timestamps.filter(time => !scans.has(time)).reverse()
    let isCancelled = false
    const pending: HTMLImageElement[] = []
    let nextIndex = 0
    const loadNext = () => {
      if (isCancelled || nextIndex >= missing.length) return
      const time = missing[nextIndex++]
      const img = new Image()
      img.crossOrigin = 'anonymous'
      // A still or throttled layer draws the arrival on the next frame.
      img.onload = () => { if (!isCancelled) { scans.set(time, img); loop.request(); loadNext() } }
      img.onerror = () => { if (!isCancelled) { scans.set(time, null); loadNext() } }
      img.src = propsRef.current.source.frameUrl({ time, filterMode, purpose: 'playback' })
      pending.push(img)
    }
    for (let i = 0; i < PLAYBACK_PRELOAD_CONCURRENCY; i++) loadNext()
    return () => {
      isCancelled = true
      pending.forEach(img => { img.onload = null; img.onerror = null })
    }
  }, [source.id, filterMode, timestampsKey, loop])

  // Sync internal playhead when scrubbing or starting playback
  useEffect(() => {
    // Playing from Now: the live view has no selected time, so the playhead starts on the latest scan.
    if (!playbackTime && isPlaying && observedTimestamps?.length) {
      internalPlayheadRef.current = observedTimestamps.length - 1
      return
    }
    if (playbackTime && playbackTimestamps) {
      const idx = playbackTimestamps.indexOf(playbackTime)
      if (idx !== -1) {
        if (!isPlaying) {
          internalPlayheadRef.current = idx
        } else {
          // If playing, the internal playhead is advancing smoothly on its own.
          // Only snap if the requested time is out of sync (e.g. user scrubbed the timeline).
          // Allow a delta of up to 1.5 frames for normal decoupled drifting.
          const dist = Math.abs(idx - internalPlayheadRef.current)

          // Handle loop-around cases so normal looping doesn't trigger a snap
          const isLoopingFwd = internalPlayheadRef.current > playbackTimestamps.length - 2 && idx === 0
          const isLoopingBack = internalPlayheadRef.current < 1 && idx === playbackTimestamps.length - 1

          if (dist > 1.5 && !isLoopingFwd && !isLoopingBack) {
            internalPlayheadRef.current = idx
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- observedTimestamps derives from the listed inputs
  }, [isPlaying, playbackTime, playbackTimestamps, forecast])

  // Initialize WebGL once and draw from the shared frame loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const attributes: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      // Fullscreen coverage has no geometric edges to multisample. Cloud/rain edge
      // softness comes from the fragment shader, unchanged by this setting.
      antialias: false,
      powerPreference: 'high-performance',
    }
    // WebGL2 draws volumetric clouds; WebGL1 the classic ones. WebGL2 also runs the
    // classic and heatmap shaders unchanged.
    const gl2 = canvas.getContext('webgl2', attributes)
    const gl = gl2 ?? canvas.getContext('webgl', attributes)
    const cloudProgram = gl ? createProgram(gl, FS_SOURCE, CLOUD_UNIFORMS) : null
    const heatmapProgram = gl ? createProgram(gl, HEATMAP_FS_SOURCE, HEATMAP_UNIFORMS) : null
    if (!gl || !cloudProgram || !heatmapProgram) {
      setHasWebGL(false)
      return
    }
    glRef.current = gl
    // Filter premultiplied frames, so a radar cell's edge fades in alpha and keeps its own
    // colour instead of blending towards whatever colour its transparent neighbours hold.
    // Both shaders unpremultiply before reading the colour.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)

    for (const { program, uniforms } of [cloudProgram, heatmapProgram]) {
      gl.useProgram(program)
      gl.uniform1i(uniforms.u_texPrev, 0)
      gl.uniform1i(uniforms.u_texNext, 1)
    }

    // Full-screen quad geometry
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)

    texPrevRef.current = createSolidTexture(gl)
    texNextRef.current = createSolidTexture(gl)
    const volume = gl2 && positionBuffer ? VolumetricClouds.create(gl2, positionBuffer) : null

    // Noise drift is integrated, so a wind update changes speed without jumping the pattern.
    let driftX = 0
    let driftY = 0
    // Volumetric detail drifts with the steering wind at its real speed, and boils on its own clock.
    let volumeDriftX = 0
    let volumeDriftY = 0
    let boil = 0
    let celestial: ReturnType<typeof getCelestialLightSource> | undefined
    let solar: ReturnType<typeof cloudLightingSun> | undefined
    let celestialLighting: RadarCloudLighting | undefined
    let celestialTime = NaN
    let celestialLatitude = NaN
    let celestialLongitude = NaN

    const render = ({ camera, now, deltaMs }: RadarFrame) => {
      const props = propsRef.current

      const isHeatmap = props.mode === 'heatmap'
      const dpr = Math.min(window.devicePixelRatio || 1, isHeatmap ? 2 : CLOUD_RENDER_POLICY.maxDevicePixelRatio)
      const targetWidth = Math.max(1, Math.round(camera.width * dpr))
      const targetHeight = Math.max(1, Math.round(camera.height * dpr))
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }
      gl.viewport(0, 0, canvas.width, canvas.height)

      let morphProgress = 0
      // Time between the two frames being morphed; live scans arrive five minutes apart.
      let frameSeconds = 300
      // The clouds are lit as at the moment on screen: now, or the scan or forecast played back.
      let lightingTime = Date.now()
      const timestamps = props.playbackTimestamps ?? []
      const isTimelineMode = timestamps.length > 0 &&
        (props.isPlaying || (props.playbackTime !== undefined && props.playbackTime !== null))

      if (isTimelineMode) {
        if (props.isPlaying) {
          // Advance internal playhead by EXACTLY the time delta based on chosen speed
          internalPlayheadRef.current = Math.min(timestamps.length - 1, internalPlayheadRef.current + deltaMs / props.morphDurationMs)
        }

        const playhead = internalPlayheadRef.current
        // Timestamps that are not times light the clouds as now.
        const shownTime = playheadTime(timestamps, playhead)
        if (Number.isFinite(shownTime)) lightingTime = shownTime
        const maxIdx = timestamps.length - 1
        const idxPrev = Math.min(Math.floor(playhead), maxIdx)
        const idxNext = Math.min(idxPrev + 1, maxIdx)
        const interval = (Date.parse(timestamps[idxNext]) - Date.parse(timestamps[idxPrev])) / 1000
        if (Number.isFinite(interval) && interval > 0) frameSeconds = interval
        const frameAt = (index: number): RadarFrameImage | undefined => {
          const upcoming = props.forecast
          if (upcoming && index >= upcoming.startIndex) return upcoming.frames[index - upcoming.startIndex]
          const scan = scanCacheRef.current.scans.get(timestamps[index])
          return isLoaded(scan) ? scan : undefined
        }

        // A scan still loading (or one FMI has not published) shows the nearest loaded frame,
        // held still: morphing towards a missing frame would leave an old one in texNextRef
        // and shift the clouds BACKWARDS.
        const shownIndex = nearestReadyFrame(idxPrev, timestamps.length, index => frameAt(index) !== undefined)
        const framePrev = shownIndex >= 0 ? frameAt(shownIndex) : undefined
        const frameNextCandidate = shownIndex === idxPrev ? frameAt(idxNext) : undefined
        const frameNext = frameNextCandidate ?? framePrev
        // With nothing loaded yet, the live scan is still in texNextRef; show it rather than
        // the empty texture before it.
        morphProgress = frameNextCandidate ? playhead - idxPrev : framePrev || lastBoundNextRef.current ? 0 : 1

        // Advancing sequentially only swaps texture handles, avoiding a redundant upload.
        if (framePrev && lastBoundPrevRef.current !== framePrev && lastBoundNextRef.current === framePrev) {
          const temp = texPrevRef.current
          texPrevRef.current = texNextRef.current
          texNextRef.current = temp
          lastBoundPrevRef.current = framePrev
          lastBoundNextRef.current = null
        }

        // Upload to Prev if needed (usually only happens on scrub or start)
        if (framePrev && lastBoundPrevRef.current !== framePrev) {
          gl.bindTexture(gl.TEXTURE_2D, texPrevRef.current)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, framePrev)
          lastBoundPrevRef.current = framePrev
        }

        // Always ensure Next is uploaded when it changes
        if (frameNext && lastBoundNextRef.current !== frameNext) {
          gl.bindTexture(gl.TEXTURE_2D, texNextRef.current)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frameNext)
          texResolutionRef.current = frameSize(frameNext)
          lastBoundNextRef.current = frameNext
        }
      } else {
        // Live mode: morph over morphDurationMs after each new frame
        morphProgress = Math.min(1.0, (now - morphStartRef.current) / props.morphDurationMs)
      }
      // Morphing into a new scan, or playing back.
      const isMorphing = isTimelineMode ? Boolean(props.isPlaying) : morphProgress < 1 && hasFrameRef.current

      // Bind textures
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texPrevRef.current)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, texNextRef.current)

      // View and frame geometry, relative to the extent center to keep float32 precise.
      const [minX, minY, maxX, maxY] = props.source.extent3857
      const anchorX = (minX + maxX) / 2
      const anchorY = (minY + maxY) / 2
      const viewWidth = camera.width * camera.metersPerPixel
      const viewHeight = camera.height * camera.metersPerPixel
      const viewOriginX = camera.centerX - viewWidth / 2 - anchorX
      const viewOriginY = camera.centerY + viewHeight / 2 - anchorY
      const texOriginX = minX - anchorX
      const texOriginY = maxY - anchorY
      const texWidth = maxX - minX
      const texHeight = maxY - minY

      const info = isHeatmap ? heatmapProgram : cloudProgram
      const u = info.uniforms
      gl.useProgram(info.program)
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.enableVertexAttribArray(info.position)
      gl.vertexAttribPointer(info.position, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1f(u.u_morph, morphProgress)
      gl.uniform2f(u.u_viewOrigin, viewOriginX, viewOriginY)
      gl.uniform2f(u.u_viewSize, viewWidth, viewHeight)
      gl.uniform2f(u.u_texOrigin, texOriginX, texOriginY)
      gl.uniform2f(u.u_texSize, texWidth, texHeight)

      if (isHeatmap) {
        const [resolutionX, resolutionY] = texResolutionRef.current
        gl.uniform2f(u.u_texResolution, resolutionX, resolutionY)
        gl.uniform2f(
          u.u_pixelsPerTexel,
          (texWidth / resolutionX) / (viewWidth / canvas.width),
          (texHeight / resolutionY) / (viewHeight / canvas.height),
        )
        gl.uniform1f(u.u_opacity, 0.95)
      } else {
        const tuning = CLOUD_VISUAL_TUNING
        const wind = screenWind(props.windSpeedMs, props.windDirectionDeg)
        // Gentle default drift when wind data is missing (exactly zero)
        const driftWind = Math.hypot(wind.x, wind.y) < 0.0001 ? { x: 0.0004, y: 0.0002 } : wind
        const driftScale = REFERENCE_SPAN_METERS * tuning.clouds.evolutionSpeed * (deltaMs / 1000)
        driftX += driftWind.x * driftScale
        driftY -= driftWind.y * driftScale

        // Sun and moon for the moment on screen; playback moves it hours in seconds, so the
        // sun sets and rises as the timeline plays.
        if (!celestial || !solar || Math.abs(lightingTime - celestialTime) >= CLOUD_RENDER_POLICY.celestialRefreshMs ||
            props.latitude !== celestialLatitude || props.longitude !== celestialLongitude || props.cloudLighting !== celestialLighting) {
          solar = cloudLightingSun(props.cloudLighting, new Date(lightingTime), props.latitude, props.longitude)
          celestial = getCelestialLightSource(solar.date, props.latitude, props.longitude)
          celestialTime = lightingTime
          celestialLatitude = props.latitude
          celestialLongitude = props.longitude
          celestialLighting = props.cloudLighting
        }

        const mercatorScale = 1 / Math.cos(Math.min(85, Math.abs(props.latitude)) * Math.PI / 180)
        // Advection slides both frames towards each other by how far the echoes move between
        // them, so a morph moves the clouds instead of fading one copy out and another in.
        // Any mismatch shows as a pulse at every frame, so the measured echo motion (ground
        // m/s, stretched by Web Mercator) wins over the surface-wind guess.
        const advection = advectionVector(props.echoMotion, wind, mercatorScale, frameSeconds)
        const noise = computeNoiseLevel(viewHeight)

        gl.uniform1f(u.u_levelMeters, noise.levelMeters)
        gl.uniform1f(u.u_levelT, noise.t)
        gl.uniform4fv(u.u_octave, noise.octaves)
        gl.uniform1f(u.u_isNight, props.isDark ? 1.0 : 0.0)
        gl.uniform2f(u.u_drift, driftX, driftY)
        // Screen-space (y down) vectors become ground vectors (y north).
        gl.uniform2f(u.u_shadowOffset, celestial.shadowOffset[0] * REFERENCE_SPAN_METERS, -celestial.shadowOffset[1] * REFERENCE_SPAN_METERS)
        gl.uniform2f(u.u_advection, advection[0], advection[1])
        // Radar diffusion follows the viewport like the tuned renderer, bounded by the radar cell size.
        gl.uniform1f(u.u_blurRadius, Math.min(15000, Math.max(1500, tuning.clouds.smoothingRadius * viewHeight)))
        // Rain and storm read the radar over a fixed ground radius, so a shower keeps its
        // extent at every zoom. The tuning is in ground meters; Web Mercator stretches them
        // by 1 / cos(latitude), about twice in Finland. Once radar cells shrink to a few
        // pixels, it spans enough pixels for rounded clouds instead of blocky cell outlines.
        gl.uniform1f(u.u_rainRadius, Math.max(tuning.precipitationRadius * mercatorScale,
          RAIN_RADIUS_MIN_PIXELS * viewHeight / canvas.height))
        gl.uniform1f(u.u_shadowStrength, celestial.shadowStrength)
        gl.uniform3f(u.u_lightDir, celestial.lightDir[0], celestial.lightDir[1], celestial.lightDir[2])

        if (volume) {
          const seconds = deltaMs / 1000
          volumeDriftX += -Math.sin(wind.angle) * wind.steeringSpeed * seconds
          volumeDriftY += -Math.cos(wind.angle) * wind.steeringSpeed * seconds
          boil += seconds * tuning.clouds.evolutionSpeed / CLOUD_VOLUME_TUNING.boilSeconds
          const observer = latLonToWebMercator(props.latitude, props.longitude)
          volume.render(volumeFrame({
            width: canvas.width, height: canvas.height,
            viewOrigin: [viewOriginX, viewOriginY], viewSize: [viewWidth, viewHeight],
            texOrigin: [texOriginX, texOriginY], texSize: [texWidth, texHeight],
            morph: morphProgress, morphing: isMorphing, advection,
            // White clouds read the radar over a fixed ground radius too, so their outline and
            // holes stay put while zooming.
            blurRadius: Math.max(CLOUD_VOLUME_TUNING.whiteRadius * mercatorScale, VOLUME_RADIUS_MIN_PIXELS * viewHeight / canvas.height),
            rainRadius: Math.max(tuning.precipitationRadius * mercatorScale, VOLUME_RADIUS_MIN_PIXELS * viewHeight / canvas.height),
            levelMeters: noise.levelMeters, levelT: noise.t,
            drift: [volumeDriftX, volumeDriftY], boil,
          }, celestial, {
            azimuth: solar.azimuth, elevation: solar.elevation, latitude: props.latitude, x: observer.x - anchorX, y: observer.y - anchorY,
          }, props.isDark), texPrevRef.current, texNextRef.current)
        }
      }

      // The shaders write every pixel, including transparent sky; no clear needed.
      if (isHeatmap || !volume) gl.drawArrays(gl.TRIANGLES, 0, 6)

      loop.setAnimating(render, cloudFrameRate(props.mode, isMorphing, camera.metersPerPixel))
    }

    const unsubscribe = loop.subscribe(render)

    return () => {
      unsubscribe()
      if (texPrevRef.current) gl.deleteTexture(texPrevRef.current)
      if (texNextRef.current) gl.deleteTexture(texNextRef.current)
      volume?.dispose()
      if (positionBuffer) gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(cloudProgram.program)
      gl.deleteProgram(heatmapProgram.program)
      glRef.current = null
      texPrevRef.current = null
      texNextRef.current = null
      hasFrameRef.current = false
      lastBoundPrevRef.current = null
      lastBoundNextRef.current = null
    }
  }, [loop])

  // Load the latest scan and morph into it. Camera changes never reach this effect.
  useEffect(() => {
    // Timeline playback uploads its own frames from the render loop
    if (timelineActive) return

    // Read through the ref: frames are keyed by the source id, so an inline host object never reloads them.
    const url = propsRef.current.source.frameUrl({ filterMode, purpose: 'live', cacheKey: liveSlot })
    if (!hasFrameRef.current) statusRef.current?.('loading')
    let isCancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      if (isCancelled) return
      liveUrlRef.current = url
      if (fallbackRef.current) fallbackRef.current.src = url
      const gl = glRef.current
      if (gl && texPrevRef.current && texNextRef.current) {
        // Swap previous next into prev, then upload the new scan as next
        const temp = texPrevRef.current
        texPrevRef.current = texNextRef.current
        texNextRef.current = temp
        gl.bindTexture(gl.TEXTURE_2D, texNextRef.current)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        texResolutionRef.current = [img.naturalWidth, img.naturalHeight]
        lastBoundPrevRef.current = null
        lastBoundNextRef.current = null
        morphStartRef.current = performance.now()
      }
      hasFrameRef.current = true
      statusRef.current?.('ready')
      loop.request()
    }

    img.onerror = () => {
      if (isCancelled) return
      console.warn('[CloudRadarCanvas] Failed to load radar frame image:', url)
      if (!hasFrameRef.current) statusRef.current?.('error')
    }
    img.src = url

    return () => {
      isCancelled = true
      img.onload = null
      img.onerror = null
    }
  }, [source.id, filterMode, liveSlot, retryKey, timelineActive, hasWebGL, loop])

  // Without WebGL the latest frame is shown as an image that follows the camera.
  useEffect(() => {
    if (hasWebGL) return
    const img = fallbackRef.current
    if (!img) return
    if (liveUrlRef.current) img.src = liveUrlRef.current
    return loop.subscribe(({ camera }) => {
      const [minX, minY, maxX, maxY] = propsRef.current.source.extent3857
      const topLeft = projectToCamera(camera, minX, maxY)
      const bottomRight = projectToCamera(camera, maxX, minY)
      img.style.transform = `translate(${topLeft.x}px, ${topLeft.y}px)`
      img.style.width = `${bottomRight.x - topLeft.x}px`
      img.style.height = `${bottomRight.y - topLeft.y}px`
    })
  }, [hasWebGL, loop])

  if (!hasWebGL) {
    return (
      <div className={`overflow-hidden pointer-events-none ${className}`}>
        <img
          ref={fallbackRef}
          alt="Weather radar"
          className="absolute left-0 top-0 max-w-none mix-blend-screen opacity-90"
          style={{ transformOrigin: '0 0' }}
        />
      </div>
    )
  }

  // Applied by the compositor, so it costs no rendering and covers both cloud renderers.
  const opacity = mode === 'clouds' ? Math.min(1, Math.max(0, cloudOpacity)) : 1
  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full block pointer-events-none ${className}`}
      style={opacity < 1 ? { opacity } : undefined}
    />
  )
}
