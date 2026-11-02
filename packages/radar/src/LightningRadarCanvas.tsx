import React, { useEffect, useRef } from 'react'
import { type LightningStrike, classifyStrikeAge } from './lightning'
import { getCelestialLightSource } from '@simon-lumikello/meanwhile-weather/core'
import { getCameraDeltaMeters, projectToCamera } from './camera'
import { latLonToWebMercator } from './mercator'
import type { RadarFrame, RadarFrameLoop } from './RadarFrameLoop'
import { computeNoiseLevel, WORLD_NOISE_GLSL } from './worldNoise'

export interface LightningRadarCanvasProps {
  loop: RadarFrameLoop
  strikes: LightningStrike[]
  /** Observer location, for sun and moon lighting. */
  latitude: number
  longitude: number
  isDark?: boolean
  windSpeedMs?: number
  windDirectionDeg?: number
  className?: string
}

/** Viewport height (EPSG:3857 meters) the storm art direction was tuned at. */
const REFERENCE_SPAN_METERS = 40000
/** Storm noise is anchored to a 100 km grid so it stays put while the camera moves. */
const ANCHOR_GRID_METERS = 100000
/** Strikes that seed storm cells in the shader, the first ones in the list; a fixed-size uniform array. */
const MAX_STORM_STRIKES = 8

const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Positions are EPSG:3857 meters relative to a fixed anchor, y pointing north.
const FS_SOURCE = `
precision highp float;
varying vec2 v_uv;

uniform vec2 u_viewOrigin;
uniform vec2 u_viewSize;
uniform vec2 u_drift;
uniform vec3 u_lightDir;
uniform float u_isNight;

// Strike position (meters) and intensity
uniform vec3 u_stormStrikes[${MAX_STORM_STRIKES}];
uniform int u_strikeCount;
uniform float u_cellRadius;

uniform vec2 u_flashPos;
uniform float u_flashRadius;
uniform float u_flashAlpha;

${WORLD_NOISE_GLSL}

void main() {
  vec2 w = u_viewOrigin + vec2(v_uv.x * u_viewSize.x, -v_uv.y * u_viewSize.y);
  float span = u_viewSize.y;

  // Evaluate storm moisture potential from strike clusters
  float stormMoisture = 0.0;
  for (int i = 0; i < ${MAX_STORM_STRIKES}; i++) {
    if (i >= u_strikeCount) break;
    float weight = u_stormStrikes[i].z;
    float dist = length(w - u_stormStrikes[i].xy);
    // Wide convective cell radius that merges into a cohesive storm anvil
    float radius = u_cellRadius * mix(0.18, 0.32, clamp(weight, 0.0, 1.0));
    float cell = smoothstep(radius, radius * 0.12, dist);
    stormMoisture = max(stormMoisture, cell);
  }

  // Early out if outside the storm cloud zone
  if (stormMoisture <= 0.005) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Atmospheric vortices and domain warps (borrowed from CloudRadarCanvas)
  vec2 warp1 = vec2(
    zfbm3(w + u_drift * (1.0 / 2.2), 2.2, vec2(0.0)),
    zfbm3(w - u_drift * (1.2 / 2.2), 2.2, vec2(4.1, 2.3))
  );
  vec2 warp2 = vec2(
    zfbm3(w + u_drift * (0.6 / 4.4), 4.4, warp1 * 1.6),
    zfbm3(w - u_drift * (0.5 / 4.4), 4.4, -warp1 * 1.6 + vec2(1.7, 3.8))
  );

  // Pure Fractal Multi-Octave Cumulus Body Synthesis
  float macroBillows = zfbm4(w - u_drift * (0.7 / 2.8), 2.8, vec2(0.0));
  float mesoBillows = zfbm4(w + u_drift * (0.5 / 5.5), 5.5, warp1 * 0.6);
  float microWisps = zsnoise(w - u_drift * (0.9 / 11.0), 11.0) * 0.5 + 0.5;

  float organicCloudVolume = macroBillows * 0.60 + mesoBillows * 0.30 + microWisps * 0.10;

  // Coverage threshold drops in the storm center so thick, dense cumulus clouds form
  float coverageThreshold = mix(0.68, 0.12, stormMoisture);
  float primaryMoisture = max(0.0, organicCloudVolume - coverageThreshold);

  if (primaryMoisture <= 0.003) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Optical depth for dense cumulonimbus thunderhead
  float opticalDepth = primaryMoisture * mix(2.5, 6.0, stormMoisture);
  float primaryDensity = 1.0 - exp(-opticalDepth * 1.8);

  // 3D Volumetric Billow Curvature & Normal Mapping
  vec2 billowW = w - u_drift * (1.0 / 3.4);
  vec2 billowWarp = warp2 * 0.4;
  float eps = (0.024 / 3.4) * span;
  float hC = zfbm3(billowW, 3.4, billowWarp);
  float hX = zfbm3(billowW + vec2(eps, 0.0), 3.4, billowWarp);
  float hY = zfbm3(billowW - vec2(0.0, eps), 3.4, billowWarp);

  float edgeSoftness = smoothstep(0.01, 0.25, primaryDensity);
  float reliefStrength = 0.95 * edgeSoftness;
  vec3 normal = normalize(vec3(
    (hC - hX) * reliefStrength,
    (hC - hY) * reliefStrength,
    1.25
  ));

  // Dynamic light direction
  vec3 lightDir = normalize(vec3(u_lightDir.xy, max(0.28, u_lightDir.z)));
  float wrap = 0.45;
  float wrappedDiff = max(0.0, (dot(normal, lightDir) + wrap) / (1.0 + wrap));
  float light = 0.65 + 0.35 * wrappedDiff;

  // Soft forward scattering sheen
  vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float forwardScatter = pow(max(0.0, dot(normal, halfVec)), 3.2) * 0.08 * edgeSoftness;

  // Ambient occlusion in deep hollows
  float billowAO = mix(0.75, 1.0, smoothstep(0.15, 0.75, mesoBillows));

  // Dark stormy cloud colors (cumulonimbus thunderhead shading)
  vec3 stormCore = vec3(0.16, 0.20, 0.28);
  vec3 stormRim = vec3(0.38, 0.44, 0.54);
  vec3 dayColor = mix(stormCore, stormRim, pow(light, 1.15)) * billowAO + forwardScatter;

  vec3 nightCore = vec3(0.10, 0.13, 0.18);
  vec3 nightRim = vec3(0.24, 0.29, 0.38);
  vec3 nightColor = mix(nightCore, nightRim, light) * billowAO;

  vec3 cloudColor = mix(dayColor, nightColor, u_isNight * 0.65);

  // Deep internal lightning glow: lights up the thick 3D cloud from the inside!
  if (u_flashAlpha > 0.01) {
    float distFlash = length(w - u_flashPos);
    float flashGlow = exp(-pow(distFlash / u_flashRadius, 1.8) * 3.0) * u_flashAlpha;
    vec3 flashLight = vec3(0.85, 0.94, 1.00);
    cloudColor = mix(cloudColor, flashLight, flashGlow * (0.4 + 0.6 * organicCloudVolume));
  }

  float alpha = clamp(primaryDensity * mix(0.75, 0.95, stormMoisture), 0.0, 0.95);
  gl_FragColor = vec4(cloudColor * alpha, alpha);
}
`

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Lightning storm shader error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(
  gl: WebGLRenderingContext,
  vsSource: string,
  fsSource: string
): WebGLProgram | null {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource)
  if (!vs || !fs) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Lightning program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

/**
 * Generates delicate, soft intra-cloud lightning veins spreading through cloud moisture.
 */
function drawInternalCloudVeins(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  alpha: number
) {
  if (alpha <= 0.05) return

  ctx.save()
  const dx = targetX - originX
  const dy = targetY - originY
  const dist = Math.hypot(dx, dy)
  const steps = Math.max(3, Math.floor(dist / 12))

  ctx.beginPath()
  ctx.moveTo(originX, originY)

  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const perpX = -dy / dist
    const perpY = dx / dist
    const jitter = (Math.sin(i * 437 + originX) * 2 - 1) * 8
    ctx.lineTo(originX + dx * t + perpX * jitter, originY + dy * t + perpY * jitter)
  }

  ctx.lineTo(targetX, targetY)

  // Soft, diffused intra-cloud electric vein
  ctx.strokeStyle = `rgba(224, 242, 254, ${0.55 * alpha})`
  ctx.shadowColor = 'rgba(186, 230, 253, 0.8)'
  ctx.shadowBlur = 6
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()

  ctx.restore()
}

interface ProjectedStrike {
  category: 'fresh' | 'recent' | 'aging'
  intensity: number
  /** Canvas pixels. */
  x: number
  y: number
  /** EPSG:3857 meters relative to the anchor. */
  worldX: number
  worldY: number
}

/**
 * Atmospheric thunderstorm visualization:
 * - NO icons or synthetic markers on the map
 * - Borrows the normal thick 3D clouds our shader knows how to draw, shaded in dark storm tones and layered on top
 * - Soft, volumetric sheet lightning flashes emanating deep within the storm clouds
 */
export const LightningRadarCanvas: React.FC<LightningRadarCanvasProps> = ({
  loop,
  strikes,
  latitude,
  longitude,
  isDark = true,
  windSpeedMs = 0,
  windDirectionDeg = 0,
  className = '',
}) => {
  const stormCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const flashCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const propsRef = useRef({ strikes, latitude, longitude, isDark, windSpeedMs, windDirectionDeg })

  useEffect(() => {
    propsRef.current = { strikes, latitude, longitude, isDark, windSpeedMs, windDirectionDeg }
    loop.request()
  }, [loop, strikes, latitude, longitude, isDark, windSpeedMs, windDirectionDeg])

  useEffect(() => {
    const stormCanvas = stormCanvasRef.current
    const flashCanvas = flashCanvasRef.current
    if (!stormCanvas || !flashCanvas) return

    const flashCtx = flashCanvas.getContext('2d')
    if (!flashCtx) return

    // Initialize WebGL for thick storm cloud shader
    const gl = stormCanvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    })

    let program: WebGLProgram | null = null
    let quadBuffer: WebGLBuffer | null = null
    const uniform = (name: string) => (gl && program ? gl.getUniformLocation(program, name) : null)

    if (gl) {
      program = createProgram(gl, VS_SOURCE, FS_SOURCE)
      if (program) {
        quadBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW
        )

        const aPosition = gl.getAttribLocation(program, 'a_position')
        gl.enableVertexAttribArray(aPosition)
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)

        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      }
    }
    const uniforms = {
      viewOrigin: uniform('u_viewOrigin'),
      viewSize: uniform('u_viewSize'),
      drift: uniform('u_drift'),
      lightDir: uniform('u_lightDir'),
      isNight: uniform('u_isNight'),
      strikes: uniform('u_stormStrikes'),
      strikeCount: uniform('u_strikeCount'),
      cellRadius: uniform('u_cellRadius'),
      flashPos: uniform('u_flashPos'),
      flashRadius: uniform('u_flashRadius'),
      flashAlpha: uniform('u_flashAlpha'),
      levelMeters: uniform('u_levelMeters'),
      levelT: uniform('u_levelT'),
      octave: uniform('u_octave'),
    }

    const strikesArray = new Float32Array(MAX_STORM_STRIKES * 3)
    let driftX = 0
    let driftY = 0

    // Flash timing cycle
    let lastFlashTime = performance.now()
    let activeFlashIndex = 0
    let nextFlashInterval = 3400

    const clearStorm = () => {
      if (gl) {
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
    }

    const render = ({ camera, now: currentPerf, deltaMs }: RadarFrame) => {
      const props = propsRef.current

      const targetW = Math.max(1, Math.round(camera.width))
      const targetH = Math.max(1, Math.round(camera.height))
      if (stormCanvas.width !== targetW || stormCanvas.height !== targetH) {
        stormCanvas.width = targetW
        stormCanvas.height = targetH
      }
      if (flashCanvas.width !== targetW || flashCanvas.height !== targetH) {
        flashCanvas.width = targetW
        flashCanvas.height = targetH
      }
      if (gl) gl.viewport(0, 0, targetW, targetH)
      flashCtx.clearRect(0, 0, targetW, targetH)

      const activeStrikes = props.strikes
      loop.setAnimating(render, activeStrikes.length > 0)
      if (activeStrikes.length === 0) {
        clearStorm()
        return
      }

      const now = new Date()
      const home = latLonToWebMercator(props.latitude, props.longitude)
      const anchorX = Math.round(home.x / ANCHOR_GRID_METERS) * ANCHOR_GRID_METERS
      const anchorY = Math.round(home.y / ANCHOR_GRID_METERS) * ANCHOR_GRID_METERS
      const scaleX = targetW / camera.width
      const scaleY = targetH / camera.height

      // Map active strikes to screen and world coordinates
      const projected: ProjectedStrike[] = []
      for (const strike of activeStrikes) {
        const { category, ageMinutes } = classifyStrikeAge(strike.time, now)
        if (category === 'expired') continue
        const world = latLonToWebMercator(strike.latitude, strike.longitude)
        const screen = projectToCamera(camera, world.x, world.y)
        // Allow a small padding buffer beyond viewport edges
        if (screen.x < -20 || screen.x > camera.width + 20 || screen.y < -20 || screen.y > camera.height + 20) continue
        projected.push({
          category,
          intensity: Math.max(0.4, 1.0 - ageMinutes / 35),
          x: screen.x * scaleX,
          y: screen.y * scaleY,
          worldX: world.x - anchorX,
          worldY: world.y - anchorY,
        })
      }

      if (projected.length === 0) {
        clearStorm()
        return
      }

      // =========================================================================
      // 1. FLASH CYCLE LOGIC
      // Determines active target and pulse envelope
      // =========================================================================
      const freshOrRecent = projected.filter((p) => p.category === 'fresh' || p.category === 'recent')
      const flashCandidates = freshOrRecent.length > 0 ? freshOrRecent : projected

      const timeSinceFlash = currentPerf - lastFlashTime
      if (timeSinceFlash > nextFlashInterval && flashCandidates.length > 0) {
        lastFlashTime = currentPerf
        activeFlashIndex = (activeFlashIndex + 1) % flashCandidates.length
        nextFlashInterval = 3200 + Math.random() * 2600
      }

      const flashElapsed = currentPerf - lastFlashTime
      let flashAlpha = 0
      const activeFlashTarget = flashCandidates[activeFlashIndex % flashCandidates.length]

      // Natural intra-cloud flash envelope with dual-pulse flutter (~340ms total)
      if (flashElapsed < 340 && activeFlashTarget) {
        if (flashElapsed < 45) {
          flashAlpha = flashElapsed / 45
        } else if (flashElapsed < 85) {
          flashAlpha = 1 - ((flashElapsed - 45) / 40) * 0.45
        } else if (flashElapsed < 135) {
          flashAlpha = 0.55 + ((flashElapsed - 85) / 50) * 0.35
        } else {
          const decayProgress = (flashElapsed - 135) / 205
          flashAlpha = 0.9 * Math.pow(1 - decayProgress, 2.2)
        }
      }

      // =========================================================================
      // 2. WEBGL THICK STORM CLOUDS
      // Uses the same zoom-continuous fractal noise as the cloud shader, in storm tones
      // =========================================================================
      if (gl && program) {
        gl.useProgram(program)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        const viewWidth = camera.width * camera.metersPerPixel
        const viewHeight = camera.height * camera.metersPerPixel
        gl.uniform2f(uniforms.viewOrigin, camera.centerX - viewWidth / 2 - anchorX, camera.centerY + viewHeight / 2 - anchorY)
        gl.uniform2f(uniforms.viewSize, viewWidth, viewHeight)
        gl.uniform1f(uniforms.isNight, props.isDark ? 1.0 : 0.0)

        const noise = computeNoiseLevel(viewHeight)
        gl.uniform1f(uniforms.levelMeters, noise.levelMeters)
        gl.uniform1f(uniforms.levelT, noise.t)
        gl.uniform4fv(uniforms.octave, noise.octaves)

        // Celestial light direction
        const celestial = getCelestialLightSource(now, props.latitude, props.longitude)
        gl.uniform3f(uniforms.lightDir, celestial.lightDir[0], celestial.lightDir[1], celestial.lightDir[2])

        // Integrated ground drift along the steering wind (default gentle breeze)
        const steeringSpeed = (props.windSpeedMs || 3) * 3.0
        const angleRad = (props.windDirectionDeg * Math.PI) / 180.0
        const driftStep = steeringSpeed * 0.00015 * REFERENCE_SPAN_METERS * (deltaMs / 1000)
        driftX += -Math.sin(angleRad) * driftStep
        driftY += -Math.cos(angleRad) * driftStep
        gl.uniform2f(uniforms.drift, driftX, driftY)

        // Up to 8 strikes passed as storm cell seeds
        const strikeCount = Math.min(MAX_STORM_STRIKES, projected.length)
        strikesArray.fill(0)
        for (let i = 0; i < strikeCount; i++) {
          strikesArray.set([projected[i].worldX, projected[i].worldY, projected[i].intensity], i * 3)
        }
        gl.uniform3fv(uniforms.strikes, strikesArray)
        gl.uniform1i(uniforms.strikeCount, strikeCount)
        gl.uniform1f(uniforms.cellRadius, REFERENCE_SPAN_METERS)

        // Flash parameters for internal cloud illumination
        if (activeFlashTarget && flashAlpha > 0.01) {
          gl.uniform2f(uniforms.flashPos, activeFlashTarget.worldX, activeFlashTarget.worldY)
          gl.uniform1f(uniforms.flashAlpha, flashAlpha)
        } else {
          gl.uniform2f(uniforms.flashPos, 1e9, 1e9)
          gl.uniform1f(uniforms.flashAlpha, 0.0)
        }
        gl.uniform1f(uniforms.flashRadius, 0.28 * REFERENCE_SPAN_METERS)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      // =========================================================================
      // 3. INTRA-CLOUD SHEET LIGHTNING FLASHES & INTERNAL VEINS
      // Drawn on flashCanvas on top of the thick storm clouds
      // =========================================================================
      if (flashAlpha > 0.02 && activeFlashTarget) {
        const { x: fx, y: fy } = activeFlashTarget
        const delta = getCameraDeltaMeters(camera)
        const flashRadius = Math.max(70, Math.min(160, (delta ? 35000 / delta : 1) * 110))

        const flashGrad = flashCtx.createRadialGradient(fx, fy, flashRadius * 0.05, fx, fy, flashRadius)

        // Soft, radiant cool-white / ice-blue intra-cloud radiance
        flashGrad.addColorStop(0, `rgba(255, 255, 255, ${0.85 * flashAlpha})`)
        flashGrad.addColorStop(0.25, `rgba(224, 242, 254, ${0.62 * flashAlpha})`)
        flashGrad.addColorStop(0.55, `rgba(186, 230, 253, ${0.32 * flashAlpha})`)
        flashGrad.addColorStop(0.85, `rgba(147, 197, 253, ${0.10 * flashAlpha})`)
        flashGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')

        flashCtx.fillStyle = flashGrad
        flashCtx.beginPath()
        flashCtx.arc(fx, fy, flashRadius, 0, Math.PI * 2)
        flashCtx.fill()

        // Delicate internal discharge veins spreading inside the thick cloud
        if (flashAlpha > 0.28) {
          drawInternalCloudVeins(flashCtx, fx, fy - 6, fx + Math.sin(activeFlashIndex * 73) * 32, fy + 22, flashAlpha)
          drawInternalCloudVeins(flashCtx, fx, fy - 6, fx - Math.cos(activeFlashIndex * 41) * 28, fy - 18, flashAlpha * 0.75)
        }
      }
    }

    const unsubscribe = loop.subscribe(render)

    return () => {
      unsubscribe()
      if (gl) {
        if (program) gl.deleteProgram(program)
        if (quadBuffer) gl.deleteBuffer(quadBuffer)
      }
    }
  }, [loop])

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none ${className}`}>
      {/* 1. WebGL Thick Storm Cloud Layer: Borrows the normal 3D cloud shader, shaded in dark storm tones on top */}
      <canvas
        ref={stormCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* 2. Intra-Cloud Sheet Lightning Flash Layer: Deep luminous pulses and veins */}
      <canvas
        ref={flashCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen opacity-95"
      />
    </div>
  )
}
