import React, { useEffect, useRef } from 'react'
import type { AirplaneData } from './types'
import { projectToCamera } from './camera'
import type { RadarFrame, RadarFrameLoop } from './RadarFrameLoop'
import { createAircraftMotion, MAX_EXTRAPOLATION_MS, showAircraft, type AircraftMotion, type AircraftPose } from './aircraftMotion'
import {
  CONTRAIL_INITIAL_WIDTH_METERS,
  CONTRAIL_MAX_STEP_METERS,
  contrailReach,
  bendContrail,
  createContrailTrail,
  layoutContrail,
  mercatorScaleAt,
  orphanContrail,
  pruneContrail,
  sampleContrail,
  upperLevelWind,
  type ContrailTrail,
  type ContrailVertex,
} from './contrails'

export interface AirplaneHover {
  plane: AirplaneData
}

interface AirplaneCanvasProps {
  loop: RadarFrameLoop
  planes?: AirplaneData[]
  isDark?: boolean
  mode?: 'airplanes' | 'shadows'
  className?: string
  windSpeedMs?: number
  windDirectionDeg?: number
  /** Pointer position in viewport CSS pixels, owned by the host so the map keeps its gestures. */
  pointerRef?: React.RefObject<{ x: number; y: number } | null>
  /** Receives the plane under the pointer on every frame. */
  onHover?: (hover: AirplaneHover | null) => void
  renderMinAltitude?: number
  renderMaxAltitude?: number
}

/** Meters of altitude, centred on each layer's limit, across which aircraft fade in or out. */
const ALTITUDE_FADE_BAND = 500

/** Opacity from the layer's altitude limits, fading across a band around each limit. */
function altitudeLayerOpacity(altitude: number, renderMinAltitude?: number, renderMaxAltitude?: number) {
  let opacity = 1
  if (renderMinAltitude !== undefined) {
    const fadeStart = renderMinAltitude - ALTITUDE_FADE_BAND / 2
    opacity = Math.min(1, Math.max(0, (altitude - fadeStart) / ALTITUDE_FADE_BAND))
  }
  if (renderMaxAltitude !== undefined) {
    const fadeStart = renderMaxAltitude - ALTITUDE_FADE_BAND / 2
    opacity = Math.min(opacity, Math.max(0, 1 - (altitude - fadeStart) / ALTITUDE_FADE_BAND))
  }
  return opacity
}

const isJetCategory = (category: number | undefined) => category === 3 || category === 4 || category === 5 || category === 6

/**
 * How strongly a jet leaves a contrail, 0 for none. We simulate 3D pockets of cold,
 * humid air in the upper atmosphere; addition instead of multiplication makes wider,
 * more natural bands.
 */
function contrailStrength(plane: AirplaneData) {
  if (!isJetCategory(plane.category) || plane.altitude <= 6000) return 0
  const atmosphericPocket = (Math.sin(plane.latitude * 15) + Math.cos(plane.longitude * 15) + Math.sin(plane.altitude / 800)) / 3
  if (atmosphericPocket <= 0.1) return 0
  return Math.min(1, (atmosphericPocket - 0.1) / 0.25) * 0.45
}

interface ContrailStripPoint {
  x: number
  y: number
  /** Half the width in canvas pixels. */
  half: number
  alpha: number
  nx: number
  ny: number
}

/** A soft edge: a wide faint pass under a narrow brighter core. */
const CONTRAIL_PASSES = [{ width: 1, alpha: 0.5 }, { width: 0.45, alpha: 0.6 }]

/** Fills one piece of trail as a strip of quads; runs with the same opacity share one path. */
function fillContrailStrip(ctx: CanvasRenderingContext2D, strip: ContrailStripPoint[], color: string) {
  for (let index = 0; index < strip.length; index++) {
    const point = strip[index]
    const before = strip[Math.max(0, index - 1)]
    const after = strip[Math.min(strip.length - 1, index + 1)]
    const dx = after.x - before.x
    const dy = after.y - before.y
    const length = Math.hypot(dx, dy) || 1
    point.nx = -dy / length
    point.ny = dx / length
  }
  for (const pass of CONTRAIL_PASSES) {
    let bandAlpha = -1
    const flush = () => {
      if (bandAlpha > 0) {
        ctx.fillStyle = `rgba(${color}, ${bandAlpha.toFixed(3)})`
        ctx.fill()
      }
      bandAlpha = -1
    }
    for (let index = 1; index < strip.length; index++) {
      const a = strip[index - 1]
      const b = strip[index]
      const alpha = Math.round(((a.alpha + b.alpha) / 2) * pass.alpha * 128) / 128
      if (alpha !== bandAlpha) {
        flush()
        ctx.beginPath()
        bandAlpha = alpha
      }
      // Neighbouring quads share their edge exactly, so a band fills without seams.
      const ha = a.half * pass.width
      const hb = b.half * pass.width
      ctx.moveTo(a.x + a.nx * ha, a.y + a.ny * ha)
      ctx.lineTo(b.x + b.nx * hb, b.y + b.ny * hb)
      ctx.lineTo(b.x - b.nx * hb, b.y - b.ny * hb)
      ctx.lineTo(a.x - a.nx * ha, a.y - a.ny * ha)
      ctx.closePath()
    }
    flush()
  }
}

/**
 * Draws one trail. Geometry comes from `layoutContrail` in map meters; only here is it
 * turned into pixels, with a minimum on-screen width so it stays visible zoomed out.
 */
function drawContrail(
  ctx: CanvasRenderingContext2D,
  vertices: ContrailVertex[],
  strength: number,
  metersPerCanvasPixel: number,
  dpr: number,
  project: (x: number, y: number) => { x: number; y: number },
  color: string,
) {
  const minWidth = 1.6 * dpr
  let strip: ContrailStripPoint[] = []
  for (let index = 0; index < vertices.length; index++) {
    const vertex = vertices[index]
    if (vertex.gap && strip.length) {
      fillContrailStrip(ctx, strip, color)
      strip = []
    }
    const point = project(vertex.x, vertex.y)
    const last = strip[strip.length - 1]
    // Zoomed out, many points fall within a pixel; skip them rather than fill dust.
    const isEnd = index === vertices.length - 1 || vertices[index + 1].gap
    if (last && !isEnd && Math.hypot(point.x - last.x, point.y - last.y) < 1.5 * dpr) continue
    const width = Math.max(minWidth * (1 + 1.5 * vertex.progress), vertex.width / metersPerCanvasPixel)
    strip.push({ x: point.x, y: point.y, half: width / 2, alpha: strength * vertex.opacity, nx: 0, ny: 0 })
  }
  if (strip.length) fillContrailStrip(ctx, strip, color)
}

function drawAirplanePath(ctx: CanvasRenderingContext2D, isJet: boolean, isRotorcraft: boolean) {
  ctx.beginPath()
  if (isJet) {
    // Commercial jet shape (refined for realistic aspect ratio)
    ctx.moveTo(6, 0)
    ctx.lineTo(5, 0.7) // nose curve right
    ctx.lineTo(2, 0.8) // fuselage right front
    ctx.lineTo(1, 0.8) // wing root front right
    ctx.lineTo(-3, 6.5) // wing tip front right (wider wingspan)
    ctx.lineTo(-4.5, 6.5) // wing tip back right
    ctx.lineTo(-1.5, 0.8) // wing root back right
    ctx.lineTo(-6.5, 0.5) // fuselage rear right
    ctx.lineTo(-7.5, 2.5) // stabilizer front right
    ctx.lineTo(-8.5, 2.5) // stabilizer back right
    ctx.lineTo(-7.5, 0.3) // stabilizer root back right
    ctx.lineTo(-9.0, 0) // tail cone
    ctx.lineTo(-7.5, -0.3) // stabilizer root back left
    ctx.lineTo(-8.5, -2.5) // stabilizer back left
    ctx.lineTo(-7.5, -2.5) // stabilizer front left
    ctx.lineTo(-6.5, -0.5) // fuselage rear left
    ctx.lineTo(-1.5, -0.8) // wing root back left
    ctx.lineTo(-4.5, -6.5) // wing tip back left
    ctx.lineTo(-3, -6.5) // wing tip front left
    ctx.lineTo(1, -0.8) // wing root front left
    ctx.lineTo(2, -0.8) // fuselage left front
    ctx.lineTo(5, -0.7) // nose curve left
    ctx.closePath()
  } else if (isRotorcraft) {
    // Simple helicopter
    ctx.moveTo(4, 0)
    ctx.lineTo(2, 1)
    ctx.lineTo(-4, 1)
    ctx.lineTo(-6, 0)
    ctx.lineTo(-4, -1)
    ctx.lineTo(2, -1)
    ctx.closePath()
    // We will draw the rotor blur separately after fill
  } else {
    // Light aircraft / general
    ctx.moveTo(4, 0) // nose
    ctx.lineTo(1, 1)
    ctx.lineTo(0, 4) // right wing
    ctx.lineTo(-1, 4)
    ctx.lineTo(-1, 1)
    ctx.lineTo(-4, 1)
    ctx.lineTo(-5, 2)
    ctx.lineTo(-6, 2)
    ctx.lineTo(-5, 0)
    ctx.lineTo(-6, -2)
    ctx.lineTo(-5, -2)
    ctx.lineTo(-4, -1)
    ctx.lineTo(-1, -1)
    ctx.lineTo(-1, -4)
    ctx.lineTo(0, -4) // left wing
    ctx.lineTo(1, -1)
    ctx.closePath()
  }
}

export const AirplaneCanvas: React.FC<AirplaneCanvasProps> = ({
  loop,
  planes = [],
  isDark = true,
  mode = 'airplanes',
  className = '',
  windSpeedMs = 0,
  windDirectionDeg = 0,
  pointerRef,
  onHover,
  renderMinAltitude,
  renderMaxAltitude,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef({ planes, isDark, mode, windSpeedMs, windDirectionDeg, renderMinAltitude, renderMaxAltitude, onHover })

  useEffect(() => {
    propsRef.current = { planes, isDark, mode, windSpeedMs, windDirectionDeg, renderMinAltitude, renderMaxAltitude, onHover }
    loop.request()
  }, [loop, planes, isDark, mode, windSpeedMs, windDirectionDeg, renderMinAltitude, renderMaxAltitude, onHover])

  // Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Track when planes are first seen to fade them in
    const seenMap = new Map<string, number>()
    const zOpacity = new Map<string, number>()
    const trails = new Map<string, ContrailTrail>()
    const motions = new Map<string, AircraftMotion>()
    let lastFrameTime = 0

    const render = ({ camera }: RadarFrame) => {
      const { planes, isDark, mode, windSpeedMs, windDirectionDeg, renderMinAltitude, renderMaxAltitude, onHover } = propsRef.current
      const dpr = window.devicePixelRatio || 1
      const targetWidth = Math.max(1, Math.round(camera.width * dpr))
      const targetHeight = Math.max(1, Math.round(camera.height * dpr))
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const baseColor = isDark ? '255, 255, 255' : '15, 23, 42'
      const traceColor = '255, 255, 255'
      const now = Date.now()
      const dt = lastFrameTime ? Math.min(100, now - lastFrameTime) : 16
      lastFrameTime = now
      const project = (x: number, y: number) => {
        const point = projectToCamera(camera, x, y)
        return { x: point.x * dpr, y: point.y * dpr }
      }

      // Clean up old planes from the seen and opacity maps to prevent memory leaks over time
      if (Math.random() < 0.01) {
        const currentIcaos = new Set(planes.map((p: AirplaneData) => p.icao24))
        for (const icao of seenMap.keys()) if (!currentIcaos.has(icao)) seenMap.delete(icao)
        for (const icao of zOpacity.keys()) if (!currentIcaos.has(icao)) zOpacity.delete(icao)
        for (const icao of motions.keys()) if (!currentIcaos.has(icao)) motions.delete(icao)
      }

      // --- Where every aircraft is shown this frame, gliding small corrections into place ---
      const poses = new Map<string, AircraftPose>()
      const guesses = new Map<string, AircraftPose>()
      for (const plane of planes) {
        if (plane.velocity === null || plane.trueTrack === null) continue
        if (now - plane.lastContact * 1000 > MAX_EXTRAPOLATION_MS) continue
        let motion = motions.get(plane.icao24)
        if (!motion) {
          motion = createAircraftMotion()
          motions.set(plane.icao24, motion)
        }
        const { pose, guess, jumped, miss } = showAircraft(motion, plane, now)
        poses.set(plane.icao24, pose)
        guesses.set(plane.icao24, guess)
        const trail = trails.get(plane.icao24)
        if (jumped) {
          // The guess was far off: fade the aircraft in at its real position and let its old trail dissolve.
          seenMap.set(plane.icao24, now)
          if (trail) orphanContrail(trail, now)
        } else if (miss && trail) {
          // A small miss: move the trail onto the corrected track as the aircraft glides there.
          bendContrail(trail, miss, miss.since, now)
        }
      }

      // --- Contrails: record every contrail-forming jet in map meters, then draw what is in view ---
      if (mode === 'airplanes') {
        const wind = upperLevelWind(windSpeedMs, windDirectionDeg)
        const heads = new Map<string, { x: number; y: number }>()
        for (const plane of planes) {
          const head = poses.get(plane.icao24)
          const guess = guesses.get(plane.icao24)
          if (!head || !guess) continue
          const strength = altitudeLayerOpacity(plane.altitude, renderMinAltitude, renderMaxAltitude) > 0 ? contrailStrength(plane) : 0
          let trail = trails.get(plane.icao24)
          if (!trail) {
            if (strength <= 0) continue
            trail = createContrailTrail()
            trails.set(plane.icao24, trail)
          }
          sampleContrail(trail, guess.x, guess.y, now, strength > 0, strength, { x: head.x - guess.x, y: head.y - guess.y })
          if (trail.lastSample !== null) heads.set(plane.icao24, head)
        }
        // A trail whose aircraft is no longer shown would hang in the sky with nothing at its end.
        for (const [icao, trail] of trails) if (!poses.has(icao)) orphanContrail(trail, now)

        const metersPerCanvasPixel = camera.metersPerPixel / dpr
        const viewHalfWidth = (camera.width / 2) * camera.metersPerPixel
        const viewHalfHeight = (camera.height / 2) * camera.metersPerPixel
        const reach = contrailReach(wind, mercatorScaleAt(camera.centerY))
        ctx.save()
        for (const [icao, trail] of trails) {
          if (!pruneContrail(trail, now)) {
            trails.delete(icao)
            continue
          }
          // Skip trails that cannot reach the view, however far the wind or a glide has carried them.
          const trailReach = reach + Math.hypot(trail.glide.x, trail.glide.y)
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
          for (const point of trail.points) {
            if (point.x < minX) minX = point.x
            if (point.x > maxX) maxX = point.x
            if (point.y < minY) minY = point.y
            if (point.y > maxY) maxY = point.y
          }
          if (maxX + trailReach < camera.centerX - viewHalfWidth || minX - trailReach > camera.centerX + viewHalfWidth
            || maxY + trailReach < camera.centerY - viewHalfHeight || minY - trailReach > camera.centerY + viewHalfHeight) continue

          const vertices = layoutContrail(trail, now, wind)
          // Join the newest point to the aircraft so the trail never lags behind it.
          const head = heads.get(icao)
          const newest = vertices[vertices.length - 1]
          if (head && Math.hypot(head.x - newest.x, head.y - newest.y) / mercatorScaleAt(head.y) < CONTRAIL_MAX_STEP_METERS) {
            vertices.push({ x: head.x, y: head.y, width: CONTRAIL_INITIAL_WIDTH_METERS * mercatorScaleAt(head.y), progress: 0, opacity: 1, gap: false })
          }
          drawContrail(ctx, vertices, trail.strength, metersPerCanvasPixel, dpr, project, traceColor)
        }
        ctx.restore()
      }

      let hoveredPlane: { plane: AirplaneData; x: number; y: number } | null = null
      const pointer = mode === 'airplanes' && onHover ? pointerRef?.current : null

      // --- Draw planes ---
      for (const plane of planes) {
        // Only planes with velocity, track, and a recent enough position have a pose
        const pose = poses.get(plane.icao24)
        if (!pose) continue

        // Filter planes that are on the ground or taxiing to avoid cluttering airports
        if (plane.altitude < 300 && plane.velocity < 50) continue

        const pos = project(pose.x, pose.y)

        // Planes are known before they come into view, so panning to them shows them at once rather than fading in.
        if (!seenMap.has(plane.icao24)) seenMap.set(plane.icao24, now)

        // Ignore planes completely off-screen
        if (pos.x < -50 || pos.x > canvas.width + 50 || pos.y < -50 || pos.y > canvas.height + 50) continue

        if (pointer) {
          // Hover hit radius is slightly generous
          if (Math.hypot(pos.x - pointer.x * dpr, pos.y - pointer.y * dpr) < 25 * dpr) {
            hoveredPlane = { plane, x: pos.x, y: pos.y }
          }
        }

        const targetZOpacity = altitudeLayerOpacity(plane.altitude, renderMinAltitude, renderMaxAltitude)

        // Smoothly interpolate zOpacity over time to prevent abrupt popping when altitude updates from API
        let currentZOpacity = zOpacity.get(plane.icao24)
        if (currentZOpacity === undefined) {
          currentZOpacity = targetZOpacity
        } else {
          const fadeSpeed = 0.5 // Opacity units per second (2 seconds for full 0-1 fade)
          const maxDelta = fadeSpeed * (dt / 1000)
          if (currentZOpacity < targetZOpacity) {
            currentZOpacity = Math.min(targetZOpacity, currentZOpacity + maxDelta)
          } else if (currentZOpacity > targetZOpacity) {
            currentZOpacity = Math.max(targetZOpacity, currentZOpacity - maxDelta)
          }
        }
        zOpacity.set(plane.icao24, currentZOpacity)

        if (currentZOpacity <= 0.01) continue

        const isJet = isJetCategory(plane.category)
        // Helicopters etc
        const isRotorcraft = plane.category === 8

        let firstSeen = seenMap.get(plane.icao24)
        if (!firstSeen) {
          firstSeen = now
          seenMap.set(plane.icao24, firstSeen)
        }

        // Fade in over 3 seconds (3000ms)
        const timeOpacity = Math.min(1.0, (now - firstSeen) / 3000)

        ctx.save()
        ctx.globalAlpha = timeOpacity * currentZOpacity

        // Visual altitude scaling (0.6x at ground level up to 1.2x at 12,000m)
        const altitudeScale = 0.6 + (Math.min(plane.altitude, 12000) / 12000) * 0.6
        const finalScale = dpr * 1.05 * altitudeScale

        if (mode === 'shadows') {
          // Dynamic shadow offset based on altitude (higher = further away)
          const shadowOffset = (plane.altitude / 800) * dpr
          ctx.translate(pos.x + shadowOffset, pos.y + shadowOffset * 1.5)

          ctx.rotate((pose.track - 90) * (Math.PI / 180))
          ctx.scale(finalScale, finalScale)

          drawAirplanePath(ctx, isJet, isRotorcraft)

          // Blur the shadow depending on altitude
          const blurAmt = Math.min(25, (plane.altitude / 600))
          ctx.shadowColor = 'rgba(0, 0, 0, 0.25)'
          ctx.shadowBlur = blurAmt * dpr
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = 0

          ctx.fillStyle = 'rgba(0,0,0,0.15)'
          ctx.fill()

          if (isRotorcraft) {
            ctx.beginPath()
            ctx.ellipse(0, 0, 1, 5, 0, 0, 2 * Math.PI)
            ctx.fill()
          }
        } else {
          ctx.translate(pos.x, pos.y)
          // The track is degrees from North, canvas rotation is clockwise from positive X (East)
          // North is -Y in canvas. 0 -> -90 deg.
          ctx.rotate((pose.track - 90) * (Math.PI / 180))
          ctx.scale(finalScale, finalScale)

          // Draw Aircraft Shape
          ctx.fillStyle = `rgba(${baseColor}, 0.95)`
          ctx.shadowColor = 'rgba(0,0,0,0.6)'
          ctx.shadowBlur = 3
          ctx.shadowOffsetY = 1.5

          drawAirplanePath(ctx, isJet, isRotorcraft)
          ctx.fill()

          if (isRotorcraft) {
            // Rotor blur
            ctx.beginPath()
            ctx.ellipse(0, 0, 1, 5, 0, 0, 2 * Math.PI)
            ctx.fillStyle = `rgba(${baseColor}, 0.4)`
            ctx.fill()
          }
        }

        ctx.restore()
      }

      if (mode === 'airplanes' && onHover) onHover(hoveredPlane ? { plane: hoveredPlane.plane } : null)

      // Draw hovered plane tooltip
      if (hoveredPlane) {
        ctx.save()
        const { plane, x, y } = hoveredPlane

        ctx.font = `600 ${10 * dpr}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
        const textCallsign = plane.callsign || plane.icao24 || 'Unknown'

        const altM = Math.round(plane.altitude)
        const textAlt = altM >= 1000 ? `${(altM / 1000).toFixed(1)} km` : `${altM} m`
        const textSpd = `${Math.round(plane.velocity * 3.6)} km/h`

        const text = `${textCallsign} · ${textAlt} · ${textSpd}`

        const textWidth = ctx.measureText(text).width
        const paddingX = 8 * dpr
        const paddingY = 6 * dpr

        const boxWidth = textWidth + paddingX * 2
        const boxHeight = 14 * dpr + paddingY * 2

        let boxX = x + 15 * dpr
        let boxY = y - boxHeight / 2

        // Keep tooltip on screen
        if (boxX + boxWidth > canvas.width - 10) boxX = x - boxWidth - 15 * dpr
        if (boxY < 10) boxY = 10
        if (boxY + boxHeight > canvas.height - 10) boxY = canvas.height - boxHeight - 10

        ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)'
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'
        ctx.lineWidth = 1 * dpr

        ctx.beginPath()
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6 * dpr)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = isDark ? '#38bdf8' : '#0369a1' // sky-400 / sky-700
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, boxX + paddingX, boxY + boxHeight / 2 + 1 * dpr)

        ctx.restore()
      }

      loop.setAnimating(render, planes.length > 0 || trails.size > 0)
    }

    const unsubscribe = loop.subscribe(render)
    return () => {
      unsubscribe()
    }
  }, [loop, pointerRef])

  return <canvas ref={canvasRef} className={`pointer-events-none ${className}`} style={{ width: '100%', height: '100%' }} />
}
