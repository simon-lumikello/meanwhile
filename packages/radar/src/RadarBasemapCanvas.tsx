import React, { useEffect, useRef, useState } from 'react'
import { latLonToWebMercator } from './core'
import type { RadarMapStyle } from './types'

interface RadarBasemapCanvasProps {
  latitude: number
  longitude: number
  deltaMeters?: number
  isDark?: boolean
  mapStyle?: RadarMapStyle
  opacity?: number
  className?: string
}

const R = 6378137
const C = 2 * Math.PI * R // Earth circumference: ~40075016.68 m

function metersToTile(x: number, y: number, z: number) {
  const normX = (x + C / 2) / C
  const normY = (C / 2 - y) / C
  const n = Math.pow(2, z)
  return { tx: normX * n, ty: normY * n }
}

export const RadarBasemapCanvas: React.FC<RadarBasemapCanvasProps> = ({
  latitude,
  longitude,
  deltaMeters = 35000,
  isDark = true,
  mapStyle = 'dark-canvas',
  opacity = 0.85,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })

  // Observe canvas size dynamically so map seamlessly re-renders between small, detailed, and wide panoramic views
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const updateSize = () => {
      const w = Math.round(canvas.clientWidth || 320)
      const h = Math.round(canvas.clientHeight || 200)
      if (w > 0 && h > 0) {
        setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
      }
    }

    updateSize()

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          const w = Math.round(entry.contentRect.width)
          const h = Math.round(entry.contentRect.height)
          if (w > 0 && h > 0) {
            setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
          }
        }
      }
    })

    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Render basemap tiles onto Canvas with strict 1:1 ground scale aspect ratio
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const displayWidth = size.width || canvas.clientWidth || 320
    const displayHeight = size.height || canvas.clientHeight || 200

    const targetWidth = Math.max(1, Math.round(displayWidth * dpr))
    const targetHeight = Math.max(1, Math.round(displayHeight * dpr))

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }

    // Preserve 1:1 ground scale across wide viewports so islands, lakes, and labels are never squashed or stretched
    const aspect = displayWidth / displayHeight
    const deltaY = deltaMeters
    const deltaX = deltaMeters * aspect

    const { x: xM, y: yM } = latLonToWebMercator(latitude, longitude)
    const minX = xM - deltaX
    const maxX = xM + deltaX
    const minY = yM - deltaY
    const maxY = yM + deltaY

    // Calculate tile zoom level matching vertical resolution
    const mpp = (2 * deltaY) / displayHeight
    const targetZoom = Math.log2(C / (256 * mpp))
    const zoom = Math.min(18, Math.max(1, Math.round(targetZoom)))

    const pMin = metersToTile(minX, maxY, zoom)
    const pMax = metersToTile(maxX, minY, zoom)

    const scaleX = targetWidth / (pMax.tx - pMin.tx)
    const scaleY = targetHeight / (pMax.ty - pMin.ty)

    const tileMinX = Math.floor(pMin.tx)
    const tileMaxX = Math.floor(pMax.tx)
    const tileMinY = Math.floor(pMin.ty)
    const tileMaxY = Math.floor(pMax.ty)

    let isCancelled = false

    // Clear canvas
    ctx.clearRect(0, 0, targetWidth, targetHeight)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const isDarkCanvas = mapStyle === 'dark-canvas'

    // Load and draw all overlapping tiles
    for (let tx = tileMinX; tx <= tileMaxX; tx++) {
      for (let ty = tileMinY; ty <= tileMaxY; ty++) {
        const primaryUrl = isDarkCanvas
          ? `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${zoom}/${ty}/${tx}`
          : `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`

        const fallbackUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${zoom}/${ty}/${tx}`

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = primaryUrl

        img.onload = () => {
          if (isCancelled) return
          const dx = (tx - pMin.tx) * scaleX
          const dy = (ty - pMin.ty) * scaleY
          ctx.drawImage(img, dx, dy, scaleX, scaleY)

          // If dark canvas, overlay crisp reference town & feature labels on top
          if (isDarkCanvas) {
            const refImg = new Image()
            refImg.crossOrigin = 'anonymous'
            refImg.src = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/${zoom}/${ty}/${tx}`
            refImg.onload = () => {
              if (isCancelled) return
              ctx.drawImage(refImg, dx, dy, scaleX, scaleY)
            }
          }
        }

        img.onerror = () => {
          if (isCancelled) return
          const fallback = new Image()
          fallback.crossOrigin = 'anonymous'
          fallback.src = fallbackUrl
          fallback.onload = () => {
            if (isCancelled) return
            const dx = (tx - pMin.tx) * scaleX
            const dy = (ty - pMin.ty) * scaleY
            ctx.drawImage(fallback, dx, dy, scaleX, scaleY)
          }
        }
      }
    }

    return () => {
      isCancelled = true
    }
  }, [latitude, longitude, deltaMeters, mapStyle, size.width, size.height])

  const getCssFilter = () => {
    if (mapStyle === 'dark-osm') {
      return 'invert(100%) hue-rotate(180deg) brightness(0.70) contrast(1.2) saturate(0.85)'
    }
    if (mapStyle === 'natural-osm') {
      return isDark ? 'brightness(0.85) contrast(1.05)' : undefined
    }
    return undefined // 'dark-canvas' is naturally dark
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        opacity,
        filter: getCssFilter(),
      }}
      className={`absolute inset-0 w-full h-full pointer-events-none transition-all duration-300 ${className}`}
    />
  )
}
