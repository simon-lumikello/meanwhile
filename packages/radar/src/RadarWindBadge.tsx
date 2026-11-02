import React from 'react'
import { Navigation, AlertTriangle } from 'lucide-react'
import {
  getWindCardinal,
  getWindBeaufort,
  getWindFlowRotation,
} from './core'
import type { WindData } from '@simon-lumikello/meanwhile-weather/core'

interface RadarWindBadgeProps {
  wind?: WindData | null
  speedMs?: number
  gustMs?: number
  directionDeg?: number
  compact?: boolean
  className?: string
}

export const RadarWindBadge: React.FC<RadarWindBadgeProps> = ({
  wind,
  speedMs: propSpeed,
  gustMs: propGust,
  directionDeg: propDirection,
  compact = true,
  className = '',
}) => {
  const speed = propSpeed !== undefined ? propSpeed : wind?.speedMs
  const gust = propGust !== undefined ? propGust : wind?.gustMs
  const direction = propDirection !== undefined ? propDirection : wind?.directionDeg

  if (speed === undefined || isNaN(speed)) {
    return null
  }

  const cardinal = getWindCardinal(direction)
  const beaufort = getWindBeaufort(speed)
  const isStorm = (gust ?? speed) >= 14 || speed >= 14
  // Meteorological wind direction is where the wind comes FROM.
  // Arrow pointing in the direction wind is flowing towards:
  const arrowRotation = getWindFlowRotation(direction)

  const showGust = gust !== undefined && (gust >= speed + 2 || gust >= 8)

  return (
    <div
      className={`relative group/wind inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 border shadow-md backdrop-blur-md select-none transition-all duration-300 pointer-events-auto cursor-pointer ${
        isStorm
          ? 'bg-red-950/80 border-red-500/50 text-red-200 shadow-red-950/50'
          : `${beaufort.bgClass} ${beaufort.borderClass} text-white shadow-black/40`
      } ${className}`}
      data-tooltip={`Wind: ${cardinal ? `${cardinal} ` : ''}${speed.toFixed(1)} m/s${
        gust ? ` (gusts ${gust.toFixed(1)} m/s)` : ''
      }`}
    >
      {/* Direction Arrow Needle */}
      {direction !== undefined ? (
        <span
          className="relative flex items-center justify-center shrink-0 w-3.5 h-3.5 transition-transform duration-500 ease-out"
          style={{ transform: `rotate(${arrowRotation}deg)` }}
          aria-hidden="true"
        >
          <Navigation
            size={11}
            className={`fill-current stroke-1 ${isStorm ? 'text-red-400' : beaufort.colorClass}`}
          />
        </span>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
      )}

      {/* Speed & Cardinal Reading */}
      <div className="flex items-center gap-1 font-mono tracking-tight leading-none">
        {cardinal && (
          <span className="font-semibold text-white/95 text-[10px]">
            {cardinal}
          </span>
        )}
        <span className={`font-bold tabular-nums text-[10px] ${beaufort.colorClass}`}>
          {speed.toFixed(1)}
        </span>
        <span className="text-[8px] font-normal text-white/60">m/s</span>

        {/* Gust Highlight */}
        {showGust && !compact && (
          <span className="text-[8px] text-amber-300/90 ml-0.5">
            ({gust.toFixed(1)})
          </span>
        )}

        {isStorm && (
          <AlertTriangle size={10} className="text-red-400 animate-pulse ml-0.5" />
        )}
      </div>

      {/* Rich Hover Breakdown Popover */}
      <div className="absolute top-full left-0 mt-1.5 hidden group-hover/wind:flex flex-col gap-1.5 p-2 rounded-xl bg-slate-950/95 border border-slate-700/90 shadow-2xl backdrop-blur-md text-[9px] text-slate-200 z-50 min-w-[170px] pointer-events-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
          <div className="flex items-center gap-1 font-semibold text-white">
            <Navigation
              size={10}
              className="fill-current text-cyan-400"
              style={{ transform: `rotate(${arrowRotation}deg)` }}
            />
            <span>Wind Conditions</span>
          </div>
          <span className={`text-[8px] font-mono px-1 py-0.2 rounded border ${beaufort.borderClass} ${beaufort.colorClass}`}>
            Beaufort {beaufort.scale}
          </span>
        </div>

        {/* Direction details */}
        {direction !== undefined && (
          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400">Direction:</span>
            <span className="font-medium text-white">
              From {cardinal} ({Math.round(direction)}°)
            </span>
          </div>
        )}

        {/* Speed details */}
        <div className="flex items-center justify-between text-[8px]">
          <span className="text-slate-400">Sustained:</span>
          <span className="font-mono font-medium text-white">
            {speed.toFixed(1)} m/s ({Math.round(speed * 3.6)} km/h)
          </span>
        </div>

        {/* Gust details */}
        {gust !== undefined && (
          <div className="flex items-center justify-between text-[8px]">
            <span className="text-slate-400">Peak Gusts:</span>
            <span className={`font-mono font-medium ${gust >= 14 ? 'text-rose-300' : 'text-amber-300'}`}>
              {gust.toFixed(1)} m/s ({Math.round(gust * 3.6)} km/h)
            </span>
          </div>
        )}

        {/* Beaufort Scale classification */}
        <div className="flex items-center justify-between text-[8px] pt-0.5 border-t border-slate-800/80">
          <span className="text-slate-400">Rating:</span>
          <span className={`font-medium ${beaufort.colorClass}`}>
            {beaufort.label}
          </span>
        </div>

        {/* Storm Warning notice */}
        {isStorm && (
          <div className="mt-0.5 px-1.5 py-1 rounded bg-red-950/60 border border-red-500/40 text-[8px] text-red-200 flex items-center gap-1 font-medium">
            <AlertTriangle size={9} className="text-red-400 shrink-0" />
            <span>Storm warning gusts (&ge; 14 m/s)</span>
          </div>
        )}
      </div>
    </div>
  )
}
