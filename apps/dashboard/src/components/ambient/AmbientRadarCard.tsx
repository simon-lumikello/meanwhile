import React from 'react'
import type { AirplaneData, RadarCloudLighting, RadarCloudTransparency, RadarFrameSource, RadarZoomLevel, RadarFilterMode, RadarRenderMode, RadarWidgetSize, ThunderstormStatus } from '@simon-lumikello/meanwhile-radar/core'
import { RadarViewport } from '@simon-lumikello/meanwhile-radar/react'
import type { AuroraVisibilityStatus } from '@simon-lumikello/meanwhile-weather/core'

export interface AmbientRadarCardProps {
  latitude: number
  longitude: number
  clock24h?: boolean
  filterMode?: RadarFilterMode
  renderMode?: RadarRenderMode
  cloudTransparency?: RadarCloudTransparency
  cloudLighting?: RadarCloudLighting
  showAirplanes?: boolean
  zoom?: RadarZoomLevel
  radarSize?: RadarWidgetSize
  inRow?: boolean
  windSpeedMs?: number
  windGustMs?: number
  windDirectionDeg?: number
  rainRate?: number | null
  radarSource?: RadarFrameSource
  airplanes?: AirplaneData[]
  auroraStatus?: AuroraVisibilityStatus
  hasActiveAurora?: boolean
  auroraKp?: number
  thunderstorm?: ThunderstormStatus
}

export const AmbientRadarCard: React.FC<AmbientRadarCardProps> = ({
  latitude,
  longitude,
  filterMode: propFilterMode,
  renderMode: propRenderMode,
  cloudTransparency,
  cloudLighting,
  showAirplanes = true,
  zoom: propZoom,
  radarSize: propRadarSize,
  inRow = false,
  windSpeedMs: propWindSpeed,
  windGustMs: propWindGust,
  windDirectionDeg: propWindDirection,
  rainRate,
  radarSource,
  airplanes,
  auroraStatus,
  hasActiveAurora: propHasActiveAurora,
  auroraKp: propAuroraKp,
  thunderstorm,
}) => {
  const isAuroraActive = propHasActiveAurora ?? auroraStatus?.isCurrentlyVisible ?? false
  const activeKp = propAuroraKp ?? auroraStatus?.currentKp ?? auroraStatus?.peakKp

  const isCompact = (propRadarSize ?? 'standard') === 'compact'
  const activeZoom: RadarZoomLevel = propZoom ?? 'close'

  const activeFilterMode = propFilterMode ?? 'clouds'
  const activeRenderMode = propRenderMode ?? 'realistic-clouds'

  return (
    <div
      className={`${
        inRow
          ? 'col-span-1 h-full min-h-[360px]'
          : `col-span-1 md:col-span-2 ${isCompact ? 'h-[320px] md:h-[360px]' : 'h-[440px] md:h-[480px]'}`
      } rounded-2xl bg-slate-900/70 shadow-2xl backdrop-blur-md ${
        thunderstorm?.isActive
          ? 'border-2 border-amber-400/70 shadow-[0_0_24px_rgba(251,191,36,0.3)]'
          : isAuroraActive
          ? 'border-2 border-emerald-400/60 aurora-card-border'
          : 'border border-white/10'
      } relative overflow-hidden transition-all duration-700 pointer-events-none select-none`}
    >
      <RadarViewport
        latitude={latitude}
        longitude={longitude}
        isDark={true}
        interactive={false}
        hasActiveAurora={isAuroraActive}
        auroraKp={activeKp}
        thunderstorm={thunderstorm}
        showAirplanes={showAirplanes}
        radarZoom={activeZoom}
        radarSize={isCompact ? 'compact' : 'standard'}
        filterMode={activeFilterMode}
        renderMode={activeRenderMode}
        cloudTransparency={cloudTransparency}
        cloudLighting={cloudLighting}
        windSpeedMs={propWindSpeed}
        windGustMs={propWindGust}
        windDirectionDeg={propWindDirection}
        rainRate={rainRate}
        radarSource={radarSource}
        airplanes={airplanes}
        showCardinalDirections={true}
        topRightSlot={
          <span className="text-[9px] font-mono text-slate-400/80 px-1.5 py-0.5 rounded bg-black/40 border border-white/5 select-none">
            5-min scan
          </span>
        }
        className="w-full h-full"
      />
    </div>
  )
}
