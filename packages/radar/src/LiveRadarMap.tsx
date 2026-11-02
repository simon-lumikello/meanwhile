import React, { useEffect, useState } from 'react'
import { Radar, ChevronDown, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@simon-lumikello/meanwhile-ui/react'
import type {
  RadarCloudLighting,
  RadarCloudTransparency,
  RadarFilterMode,
  RadarFrameSource,
  RadarMapStyle,
  RadarRenderMode,
  RadarWidgetSize,
  RadarZoomLevel,
} from './types'
import { RadarViewport } from './RadarViewport'
import type { ThunderstormStatus } from './lightning'
import type { AirplaneData, RadarViewArea } from './types'

export interface LiveRadarMapProps {
  latitude: number
  longitude: number
  isDark?: boolean
  showBasemap?: boolean
  showAirplanes?: boolean
  mapStyle?: RadarMapStyle
  radarZoom?: RadarZoomLevel
  radarSize?: RadarWidgetSize
  windSpeedMs?: number
  windGustMs?: number
  windDirectionDeg?: number
  rainRate?: number | null
  /** Georeferenced radar frames; the map requests live and playback scans itself. */
  radarSource?: RadarFrameSource
  airplanes?: AirplaneData[]
  /** Reports the settled visible area; see `RadarViewport`. */
  onViewAreaChange?: (area: RadarViewArea) => void
  auroraStatus?: unknown // Deprecated
  hasActiveAurora?: boolean
  auroraKp?: number
  thunderstorm?: ThunderstormStatus
  className?: string
  /** Eases back home after this long without a map gesture (default two minutes; 0 keeps the view). */
  autoRecenterMs?: number
  filterMode?: RadarFilterMode
  renderMode?: RadarRenderMode
  /** How much of the map shows through the realistic clouds; see `RadarViewport`. */
  cloudTransparency?: RadarCloudTransparency
  /** Extra opacity factor for the realistic clouds (0–1); see `RadarViewport`. */
  cloudOpacity?: number
  /** @deprecated The zoom preset button is gone; wheel and pinch zoom freely. Never called. */
  onCycleZoom?: (nextZoom?: RadarZoomLevel) => void
  /** @deprecated The zoom preset button is gone; wheel and pinch zoom freely. Never called. */
  onZoomChange?: (nextZoom: RadarZoomLevel) => void
  onFilterChange?: (nextMode: RadarFilterMode) => void
  onToggleFilter?: (nextMode?: RadarFilterMode) => void
  onRenderModeChange?: (nextMode: RadarRenderMode) => void
  onToggleClouds?: (nextMode?: RadarRenderMode) => void
  onCloudTransparencyChange?: (next: RadarCloudTransparency) => void
  /** Whether the clouds follow the sun through the day or stay lit as at midday; see `RadarViewport`. */
  cloudLighting?: RadarCloudLighting
  onCloudLightingChange?: (next: RadarCloudLighting) => void
  /** Offers the timeline and its forecast; see `RadarViewport`. */
  showTimeline?: boolean
  forecastMinutes?: number
  /** Where the maximized radar sits on the page (fixed-position classes); the default fills it with a small margin. */
  maximizedClassName?: string
}

export const LiveRadarMap: React.FC<LiveRadarMapProps> = ({
  latitude,
  longitude,
  isDark = true,
  showBasemap,
  showAirplanes,
  mapStyle,
  radarZoom,
  radarSize,
  filterMode: propFilterMode,
  renderMode: propRenderMode,
  cloudTransparency,
  cloudOpacity,
  windSpeedMs,
  windGustMs,
  windDirectionDeg,
  rainRate,
  radarSource,
  airplanes,
  onViewAreaChange,
  hasActiveAurora: propHasActiveAurora,
  auroraKp: propAuroraKp,
  thunderstorm,
  className = '',
  autoRecenterMs = 2 * 60 * 1000,
  onFilterChange,
  onToggleFilter: propOnToggleFilter,
  onRenderModeChange,
  onToggleClouds: propOnToggleClouds,
  onCloudTransparencyChange,
  cloudLighting,
  onCloudLightingChange,
  showTimeline,
  forecastMinutes,
  maximizedClassName = 'inset-4',
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [isMaximized, setIsMaximized] = useState<boolean>(false)

  // Escape returns a maximized radar to its normal size.
  useEffect(() => {
    if (!isMaximized) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMaximized(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMaximized])

  const [uncontrolledFilterMode, setUncontrolledFilterMode] = useState<'clouds' | 'rain'>(propFilterMode ?? 'clouds')
  const currentFilterMode: 'clouds' | 'rain' = (onFilterChange || propOnToggleFilter)
    ? (propFilterMode ?? 'clouds')
    : (propFilterMode ?? uncontrolledFilterMode)

  const handleToggleFilter = (nextModeParam?: 'rain' | 'clouds') => {
    const nextMode = nextModeParam ?? (currentFilterMode === 'clouds' ? 'rain' : 'clouds')
    if (onFilterChange) {
      onFilterChange(nextMode)
    } else if (propOnToggleFilter) {
      propOnToggleFilter(nextMode)
    } else {
      setUncontrolledFilterMode(nextMode)
    }
  }

  const [uncontrolledRenderMode, setUncontrolledRenderMode] = useState<'radar-blocks' | 'realistic-clouds'>(propRenderMode ?? 'realistic-clouds')
  const currentRenderMode: 'radar-blocks' | 'realistic-clouds' = (onRenderModeChange || propOnToggleClouds)
    ? (propRenderMode ?? 'realistic-clouds')
    : (propRenderMode ?? uncontrolledRenderMode)

  const handleToggleClouds = (nextModeParam?: 'radar-blocks' | 'realistic-clouds') => {
    const nextMode = nextModeParam ?? (currentRenderMode === 'radar-blocks' ? 'realistic-clouds' : 'radar-blocks')
    if (onRenderModeChange) {
      onRenderModeChange(nextMode)
    } else if (propOnToggleClouds) {
      propOnToggleClouds(nextMode)
    } else {
      setUncontrolledRenderMode(nextMode)
    }
  }

  const currentSize: RadarWidgetSize = radarSize ?? 'standard'
  const isCompact = currentSize === 'compact'

  const isAuroraActive = propHasActiveAurora ?? false
  const activeKp = propAuroraKp

  if (isCollapsed) {
    return (
      <Button
        tone="neutral"
        onClick={() => { setIsCollapsed(false); setIsMaximized(false) }}
        icon={<Radar className="text-cyan-400 transition-transform group-hover/radar:rotate-45" />}
        pill
        className={`group/radar shadow-lg ${className}`}
      >
        <span>Live Radar</span>
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-radar-ping" />
      </Button>
    )
  }

  return (
    <div
      className={
        isMaximized
          ? `fixed ${maximizedClassName} z-50 flex flex-col`
          : `flex flex-col ${isCompact ? 'w-[440px]' : 'w-[640px]'} max-w-[calc(100vw-1.5rem)]`
      }
    >
      <div
        className={`relative overflow-clip rounded-2xl border transition-all select-none w-full shadow-2xl ${
          isMaximized ? 'h-full' : isCompact ? 'h-[280px]' : 'h-[400px]'
        } ${
          isAuroraActive
            ? 'border-2 border-emerald-400/60 aurora-card-border'
            : isDark
            ? 'border-white/10'
            : 'border-slate-300 shadow-slate-900/20'
        } ${
          isDark ? 'bg-slate-950' : 'bg-slate-900'
        } ${className}`}
      >
        <RadarViewport
        latitude={latitude}
        longitude={longitude}
        isDark={isDark}
        interactive={true}
        hasActiveAurora={isAuroraActive}
        auroraKp={activeKp}
        thunderstorm={thunderstorm}
        showBasemap={showBasemap}
        showAirplanes={showAirplanes}
        mapStyle={mapStyle}
        radarZoom={radarZoom}
        radarSize={currentSize}
        windSpeedMs={windSpeedMs}
        windGustMs={windGustMs}
        windDirectionDeg={windDirectionDeg}
        rainRate={rainRate}
        radarSource={radarSource}
        airplanes={airplanes}
        onViewAreaChange={onViewAreaChange}
        autoRecenterMs={autoRecenterMs}
        filterMode={currentFilterMode}
        renderMode={currentRenderMode}
        cloudTransparency={cloudTransparency}
        cloudOpacity={cloudOpacity}
        onCloudTransparencyChange={onCloudTransparencyChange}
        cloudLighting={cloudLighting}
        onCloudLightingChange={onCloudLightingChange}
        onToggleFilter={handleToggleFilter}
        onToggleClouds={handleToggleClouds}
        topRightSlot={
          <>
            <Button
              size="sm"
              variant="overlay"
              tone="neutral"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore radar size (Esc)' : 'Maximize radar'}
              aria-label={isMaximized ? 'Restore radar size' : 'Maximize radar'}
              icon={isMaximized ? <Minimize2 /> : <Maximize2 />}
            />
            <Button
              size="sm"
              variant="overlay"
              tone="neutral"
              onClick={() => { setIsMaximized(false); setIsCollapsed(true) }}
              title="Minimize radar"
              aria-label="Minimize radar"
              icon={<ChevronDown />}
            />
          </>
        }
        showControls={true}
        showTimeline={showTimeline}
        forecastMinutes={forecastMinutes}
        className="w-full h-full"
      />
      </div>
    </div>
  )
}
