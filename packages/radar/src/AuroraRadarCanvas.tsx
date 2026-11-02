import React, { useEffect, useRef } from 'react'

export interface AuroraRadarCanvasProps {
  className?: string
  opacity?: number
  intensity?: number // 0.5 to 1.5 multiplier based on Kp index
}

/**
 * High-altitude (100–300 km) Aurora Borealis atmospheric curtain visualization
 * positioned "closer to the camera" than tropospheric clouds (1–10 km).
 *
 * Uses alpha-composited volumetric ribbons with high-saturation jewel tones
 * (emerald, electric cyan, and amethyst) and soft contrast shadows, ensuring
 * crisp visibility against both dark nocturnal terrain and bright white overcast clouds.
 */
export const AuroraRadarCanvas: React.FC<AuroraRadarCanvasProps> = ({
  className = '',
  opacity = 0.95,
  intensity = 1.0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number | null = null
    let isVisible = document.visibilityState === 'visible'
    let startTime = performance.now()

    // High-DPI sizing
    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = Math.max(rect.width || 400, 200)
      const height = Math.max(rect.height || 300, 150)
      const targetW = Math.round(width * dpr)
      const targetH = Math.round(height * dpr)

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }
    }

    updateCanvasSize()

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize()
    })
    resizeObserver.observe(canvas)

    const onVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible'
      if (isVisible && !animationFrameId) {
        startTime = performance.now()
        render()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Auroral ribbon configurations with luminous, ethereal palette (visible over both dark map and white clouds)
    const ribbons = [
      {
        baseYRatio: 0.28,
        bowing: 0.12,
        height: 75,
        speed: 0.00032,
        freq: 0.0032,
        amp: 22,
        folds: 0.02,
        // Bright luminous mint -> electric cyan -> soft lavender
        primaryColor: 'rgba(52, 211, 153, ', // #34d399 bright neon emerald / mint
        secondaryColor: 'rgba(45, 212, 191, ', // #2dd4bf bright electric turquoise
        tipColor: 'rgba(192, 132, 252, ', // #c084fc soft lavender
        coreColor: 'rgba(236, 253, 245, 0.95)', // radiant white-mint spine
        glowColor: 'rgba(52, 211, 153, 0.95)',
        alpha: 0.68,
      },
      {
        baseYRatio: 0.40,
        bowing: 0.16,
        height: 90,
        speed: -0.00026,
        freq: 0.0026,
        amp: 28,
        folds: 0.016,
        primaryColor: 'rgba(110, 231, 183, ', // #6ee7b7 light mint
        secondaryColor: 'rgba(56, 189, 248, ', // #38bdf8 bright sky cyan
        tipColor: 'rgba(216, 180, 254, ', // #d8b4fe delicate lilac
        coreColor: 'rgba(224, 242, 254, 0.92)',
        glowColor: 'rgba(45, 212, 191, 0.90)',
        alpha: 0.58,
      },
      {
        baseYRatio: 0.18,
        bowing: 0.08,
        height: 60,
        speed: 0.00042,
        freq: 0.0042,
        amp: 16,
        folds: 0.024,
        primaryColor: 'rgba(16, 185, 129, ', // #10b981 emerald
        secondaryColor: 'rgba(20, 184, 166, ', // #14b8a6 teal
        tipColor: 'rgba(192, 132, 252, ', // #c084fc lavender
        coreColor: 'rgba(209, 250, 229, 0.90)',
        glowColor: 'rgba(16, 185, 129, 0.85)',
        alpha: 0.50,
      },
    ]

    const render = () => {
      if (!isVisible) {
        animationFrameId = null
        return
      }

      const now = performance.now()
      const t = (now - startTime) * 0.001 // seconds

      const w = canvas.width
      const h = canvas.height
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

      ctx.clearRect(0, 0, w, h)

      // Use standard alpha blending so bright luminous colors float lightly without darkening
      ctx.globalCompositeOperation = 'source-over'

      // Slow breathing luminescence (~7.5s cycle)
      const breath = 0.88 + 0.12 * Math.sin(t * 0.82)
      const effIntensity = intensity * breath

      // 1. Draw each sweeping auroral drapery ribbon
      for (let rIdx = 0; rIdx < ribbons.length; rIdx++) {
        const r = ribbons[rIdx]
        const stepPx = Math.max(6, Math.floor(8 * dpr))
        const numSteps = Math.ceil(w / stepPx)

        // Precalculate ribbon base path points and envelope
        const points: { x: number; yBase: number; curHeight: number; alphaFold: number }[] = []
        let minTopY = h
        let maxBaseY = 0

        for (let i = 0; i <= numSteps; i++) {
          const x = i * stepPx
          const normX = (x / w) * 2 - 1 // -1 (left) to 1 (right)

          // Curvature: natural sweeping geomagnetic arc
          const bowOffset = (1 - normX * normX) * (h * r.bowing)

          // Traveling harmonic sine waves
          const wave1 = Math.sin(x * r.freq + t * r.speed * 1000) * (r.amp * dpr)
          const wave2 = Math.cos(x * r.freq * 2.1 - t * r.speed * 750 + rIdx) * (r.amp * 0.4 * dpr)
          const wave3 = Math.sin(x * r.freq * 0.6 + t * 0.25) * (r.amp * 0.3 * dpr)

          const yBase = h * r.baseYRatio + bowOffset + wave1 + wave2 + wave3

          // Soft fold thickness modulation along the curtain
          const foldMod = 0.75 + 0.25 * Math.sin(x * r.folds + t * 0.8 + rIdx * 1.5)
          const curHeight = r.height * dpr * foldMod * effIntensity
          const topY = yBase - curHeight

          if (topY < minTopY) minTopY = topY
          if (yBase > maxBaseY) maxBaseY = yBase

          // Dynamic fold brightness shimmer
          const alphaFold = 0.80 + 0.20 * Math.cos(x * (r.folds * 1.5) - t * 0.6 + rIdx)

          points.push({ x, yBase, curHeight, alphaFold })
        }

        const baseAlpha = Math.min(0.9, r.alpha * effIntensity)

        // --- Pass 1: Luminous Ethereal Continuous Curtain (Single gradient per ribbon) ---
        const grad = ctx.createLinearGradient(0, maxBaseY, 0, Math.max(0, minTopY))
        grad.addColorStop(0.0, `${r.primaryColor}${0.85 * baseAlpha})`)
        grad.addColorStop(0.25, `${r.primaryColor}${0.65 * baseAlpha})`)
        grad.addColorStop(0.55, `${r.secondaryColor}${0.45 * baseAlpha})`)
        grad.addColorStop(0.85, `${r.tipColor}${0.25 * baseAlpha})`)
        grad.addColorStop(1.0, `${r.tipColor}0)`)

        ctx.beginPath()
        for (let i = 0; i < points.length; i++) {
          const p = points[i]
          const topY = p.yBase - p.curHeight
          if (i === 0) ctx.moveTo(p.x, topY)
          else ctx.lineTo(p.x, topY)
        }
        for (let i = points.length - 1; i >= 0; i--) {
          const p = points[i]
          ctx.lineTo(p.x, p.yBase)
        }
        ctx.closePath()
        ctx.fillStyle = grad
        ctx.fill()

        // --- Pass 2: Delicate Vertical Ionospheric Pleat Rays ---
        ctx.save()
        ctx.lineWidth = Math.max(1.5, 2 * dpr)
        for (let i = 1; i < points.length - 1; i += 2) {
          const p = points[i]
          if (p.alphaFold > 0.82) {
            const rayAlpha = (p.alphaFold - 0.82) * 2.2 * baseAlpha
            ctx.strokeStyle = `${r.secondaryColor}${rayAlpha.toFixed(2)})`
            ctx.beginPath()
            ctx.moveTo(p.x, p.yBase)
            ctx.lineTo(p.x, p.yBase - p.curHeight * 0.9)
            ctx.stroke()
          }
        }
        ctx.restore()

        // --- Pass 3: Multi-Pass Radiant Emission Spine (Zero-overhead Neon Glow) ---
        ctx.save()
        ctx.beginPath()
        for (let i = 0; i < points.length; i++) {
          const p = points[i]
          if (i === 0) ctx.moveTo(p.x, p.yBase)
          else ctx.lineTo(p.x, p.yBase)
        }

        // Broad ambient neon glow
        ctx.strokeStyle = r.glowColor
        ctx.lineWidth = 6 * dpr
        ctx.globalAlpha = 0.25 * effIntensity
        ctx.stroke()

        // Mid luminous beam
        ctx.lineWidth = 3 * dpr
        ctx.globalAlpha = 0.5 * effIntensity
        ctx.stroke()

        // Core laser-sharp radiant spine
        ctx.strokeStyle = r.coreColor
        ctx.lineWidth = 1.4 * dpr
        ctx.globalAlpha = 0.95 * effIntensity
        ctx.stroke()
        ctx.restore()
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
      resizeObserver.disconnect()
    }
  }, [intensity])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-700 ${className}`}
      style={{ opacity }}
    />
  )
}
