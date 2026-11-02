import React, { useState, useEffect, useMemo } from 'react'
import { type AirplaneData, type RadarCloudLighting, type RadarCloudTransparency, type RadarFilterMode, type RadarFrameSource, type RadarRenderMode, type RadarWidgetSize, type RadarZoomLevel } from '@simon-lumikello/meanwhile-radar/core'
import { type ThunderstormStatus } from '@simon-lumikello/meanwhile-radar/core'
import type { AuroraVisibilityStatus } from '@simon-lumikello/meanwhile-weather/core'
import { LiveRadarMap, useRadarPositionTransition } from '@simon-lumikello/meanwhile-radar/react'
import type { PositionedEvent } from '@dashboard/features/timeline/calendar'
import { chooseRadarPlacement, type RadarCornerLane } from '@dashboard/features/timeline/radarCorner'

export interface WeatherRadarOverlayProps {
  hidden?: boolean
  latitude: number
  longitude: number
  isDark?: boolean
  showAirplanes?: boolean
  radarZoom?: RadarZoomLevel
  radarSize?: RadarWidgetSize
  filterMode?: RadarFilterMode
  renderMode?: RadarRenderMode
  cloudTransparency?: RadarCloudTransparency
  cloudLighting?: RadarCloudLighting
  windSpeedMs?: number
  windGustMs?: number
  windDirectionDeg?: number
  rainRate?: number | null
  radarSource?: RadarFrameSource
  airplanes?: AirplaneData[]
  /** Positioned events per lane for the selected day; the radar avoids covering those not yet ended */
  eventsByLane: Record<string, PositionedEvent[]>
  /** Enabled lanes in display order */
  lanes: RadarCornerLane[]
  now: Date
  orientation: 'horizontal' | 'vertical'
  auroraStatus?: AuroraVisibilityStatus
  thunderstorm?: ThunderstormStatus
  className?: string
  onZoomChange?: (zoom: RadarZoomLevel) => void
  onFilterChange?: (filter: RadarFilterMode) => void
  onRenderModeChange?: (mode: RadarRenderMode) => void
  onCloudTransparencyChange?: (transparency: RadarCloudTransparency) => void
  onCloudLightingChange?: (lighting: RadarCloudLighting) => void
}

export const WeatherRadarOverlay: React.FC<WeatherRadarOverlayProps> = ({
  hidden = false,
  latitude,
  longitude,
  isDark = true,
  showAirplanes = true,
  radarZoom = 'close',
  radarSize = 'standard',
  filterMode,
  renderMode,
  cloudTransparency,
  cloudLighting,
  windSpeedMs,
  windGustMs,
  windDirectionDeg,
  rainRate,
  radarSource,
  airplanes,
  eventsByLane,
  lanes,
  now,
  orientation,
  auroraStatus,
  thunderstorm,
  className = '',
  onZoomChange,
  onFilterChange,
  onRenderModeChange,
  onCloudTransparencyChange,
  onCloudLightingChange,
}) => {
  // 1. Viewport width tracking for timeline space calculations
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1920
  )

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 2. Prefer the left corner; move right only to avoid covering events that haven't ended
  const placement = useMemo(
    () => chooseRadarPlacement({ eventsByLane, lanes, orientation, radarSize, windowWidth, now }),
    [eventsByLane, lanes, orientation, radarSize, windowWidth, now]
  )

  // 3. Smooth fade-out -> switch position -> fade-in transition
  const { displayedPosition, isFadingOut } = useRadarPositionTransition({
    targetPlacement: placement.corner,
    hidden,
  })

  // Positioning:
  // - 'left': the preferred corner (12px past the 00:00 tick / lane header boundary in the
  //   horizontal layout; past the time axis and any leading weather column in the vertical one)
  // - 'right': used when the left corner would cover events that haven't ended (12px from the screen right edge)
  const leftPx = displayedPosition === 'left' ? placement.leftPx : undefined
  const positionClass =
    displayedPosition === 'left'
      ? leftPx === undefined ? 'left-[60px] md:left-[220px]' : ''
      : 'right-3'

  return (
    <div
      aria-hidden={hidden ? 'true' : undefined}
      style={leftPx === undefined ? undefined : { left: leftPx }}
      className={`fixed bottom-3 z-30 transition-opacity duration-500 ease-in-out ${positionClass} ${
        isFadingOut || hidden ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      } ${className}`}
    >
      <LiveRadarMap
        latitude={latitude}
        longitude={longitude}
        isDark={isDark}
        showAirplanes={showAirplanes}
        radarZoom={radarZoom}
        radarSize={radarSize}
        filterMode={filterMode}
        renderMode={renderMode}
        cloudTransparency={cloudTransparency}
        cloudLighting={cloudLighting}
        windSpeedMs={windSpeedMs}
        windGustMs={windGustMs}
        windDirectionDeg={windDirectionDeg}
        rainRate={rainRate}
        radarSource={radarSource}
        airplanes={airplanes}
        hasActiveAurora={auroraStatus?.isCurrentlyVisible}
        auroraKp={auroraStatus?.currentKp ?? auroraStatus?.peakKp}
        thunderstorm={thunderstorm}
        onZoomChange={onZoomChange}
        onFilterChange={onFilterChange}
        onRenderModeChange={onRenderModeChange}
        onCloudTransparencyChange={onCloudTransparencyChange}
        onCloudLightingChange={onCloudLightingChange}
        // Maximized, it stays below the header (h-14), which is always visible
        maximizedClassName="inset-x-4 bottom-4 top-[72px]"
      />
    </div>
  )
}
