import React from 'react'
import { Clock, MapPin, Sparkles, CheckCircle2, AlignLeft, CloudRain, Wind, AlertTriangle } from 'lucide-react'
import type { HoveredEventInfo } from './EventCard'
import type { WeatherSymbol } from '@simon-lumikello/meanwhile-weather/core'
import type { HoveredWeatherInfo } from './WeatherSwimlane'
import { formatEventTimeRange } from './eventTimeLabel'

export type HoveredTooltipInfo = HoveredEventInfo | HoveredWeatherInfo

interface FloatingTooltipProps {
  info: HoveredTooltipInfo | null
  clock24h?: boolean
  isDark?: boolean
  currentTime?: Date
}

function getWeatherSymbolDescription(symbol: WeatherSymbol): string {
  switch (symbol) {
    case 'clear-day':
      return 'Clear Sky'
    case 'clear-night':
      return 'Clear Night'
    case 'partly-cloudy-day':
    case 'partly-cloudy-night':
      return 'Partly Cloudy'
    case 'cloudy':
      return 'Overcast / Cloudy'
    case 'rain-light':
      return 'Light Rain Showers'
    case 'rain-moderate':
      return 'Moderate Rain'
    case 'rain-heavy':
      return 'Heavy Rain'
    case 'sleet':
      return 'Sleet'
    case 'snow-light':
      return 'Light Snow'
    case 'snow-heavy':
      return 'Heavy Snow'
    case 'thunder':
      return 'Thunderstorm'
    case 'fog':
      return 'Fog / Mist'
    default:
      return 'Weather Forecast'
  }
}

export const FloatingTooltip: React.FC<FloatingTooltipProps> = ({
  info,
  clock24h = true,
  isDark = true,
  currentTime,
}) => {
  if (!info) return null

  const formatTime = (d: Date) => {
    return clock24h
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const { colorScheme, rect } = info

  // Clamp horizontal position so tooltip stays within the viewport window
  const centerX = rect.left + rect.width / 2
  const clampedX = Math.max(160, Math.min(window.innerWidth - 160, centerX))

  // Determine whether to show above or below the card
  const showBelow = rect.top < 140
  const targetY = showBelow ? rect.bottom + 8 : rect.top - 8

  // 1. Weather Hover Hint
  if ('point' in info) {
    const { point } = info
    const pointDate = new Date(point.time)
    const isStorm = point.isStormWarning || (point.windSpeedMs && point.windSpeedMs >= 14)

    return (
      <div
        className="fixed z-50 pointer-events-none transition-all duration-75 animate-in fade-in zoom-in-95 duration-100 select-none"
        style={{
          left: `${clampedX}px`,
          top: `${targetY}px`,
          transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        }}
      >
        <div
          className="relative bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xl backdrop-blur-md max-w-xs text-left transition-colors"
          style={{
            borderColor: isDark ? `${colorScheme.primary}66` : `${colorScheme.primary}88`,
            boxShadow: isDark
              ? `0 12px 30px -4px rgba(0, 0, 0, 0.8), 0 0 20px ${colorScheme.primary}33`
              : `0 12px 30px -4px rgba(0, 0, 0, 0.15), 0 0 16px ${colorScheme.primary}25`,
          }}
        >
          {/* Title & Temperature */}
          <div className="flex items-center justify-between gap-3">
            <span
              className="font-bold text-sm leading-snug break-words"
              style={{ color: isDark ? colorScheme.text : '#0f172a' }}
            >
              {getWeatherSymbolDescription(point.symbol)}
            </span>
            <span className="text-base font-extrabold tabular-numbers font-mono text-slate-900 dark:text-white shrink-0">
              {Math.round(point.temperature)}°C
            </span>
          </div>

          {/* Forecast Time */}
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-600 dark:text-slate-200 font-medium tabular-numbers">
            <Clock size={12} className="text-slate-400 shrink-0" />
            <span>{formatTime(pointDate)}</span>
          </div>

          {/* Rain / Precipitation */}
          <div className="flex items-center gap-1.5 mt-1 text-xs text-sky-600 dark:text-sky-300">
            <CloudRain size={12} className="text-sky-500 dark:text-sky-400 shrink-0" />
            <span>
              {point.precipitationMm > 0
                ? `${point.precipitationMm} mm rain (${point.precipitationProbability || 0}% chance)`
                : 'No precipitation'}
            </span>
          </div>

          {/* Wind & Storm */}
          <div className="flex items-center justify-between gap-2 mt-1 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-1.5">
              <Wind size={12} className="text-teal-600 dark:text-teal-400 shrink-0" />
              <span>Wind {point.windSpeedMs || 0} m/s</span>
            </div>
            {isStorm && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 text-[10px] font-bold">
                <AlertTriangle size={10} className="text-rose-500 dark:text-rose-400" />
                <span>Storm</span>
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 2. Calendar Event Hover Hint
  const { event } = info

  const timeLabel = event.isAllDay
    ? 'All Day'
    : formatEventTimeRange(new Date(event.start), new Date(event.end), formatTime)

  const durationMinutes = Math.round(
    (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000
  )
  const durationHours = Math.floor(durationMinutes / 60)
  const remMinutes = durationMinutes % 60
  const durationStr = event.isAllDay
    ? ''
    : durationHours > 0
    ? ` (${durationHours}h${remMinutes > 0 ? ` ${remMinutes}m` : ''})`
    : ` (${remMinutes}m)`

  return (
    <div
      className="fixed z-50 pointer-events-none transition-all duration-75 animate-in fade-in zoom-in-95 duration-100 select-none"
      style={{
        left: `${clampedX}px`,
        top: `${targetY}px`,
        transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      <div
        className="relative bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-2xl backdrop-blur-md max-w-xs text-left transition-colors"
        style={{
          borderColor: isDark ? `${colorScheme.primary}66` : `${colorScheme.primary}88`,
          boxShadow: isDark
            ? `0 12px 30px -4px rgba(0, 0, 0, 0.8), 0 0 20px ${colorScheme.primary}33`
            : `0 12px 30px -4px rgba(0, 0, 0, 0.15), 0 0 16px ${colorScheme.primary}25`,
        }}
      >
        {/* Title */}
        <div
          className="font-semibold tracking-normal text-sm leading-snug break-words"
          style={{ color: isDark ? colorScheme.text : '#0f172a' }}
        >
          {event.title}
        </div>

        {/* Time & Duration */}
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-600 dark:text-slate-200 font-medium tabular-numbers">
          <Clock size={12} className="text-slate-400 shrink-0" />
          <span>
            {timeLabel}
            {durationStr}
          </span>
        </div>

        {/* Location if present */}
        {event.location && (
          <div className="flex items-start gap-1.5 mt-1 text-xs text-slate-600 dark:text-slate-300 break-words leading-tight">
            <MapPin size={12} className="text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
            <span className="flex-1 line-clamp-2">{event.location}</span>
          </div>
        )}

        {/* Multiline Description Preview if present */}
        {event.description && (
          <div className="flex items-start gap-1.5 mt-1.5 pt-1.5 border-t border-slate-200/80 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300 font-normal leading-relaxed">
            <AlignLeft size={12} className="text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 line-clamp-3 whitespace-pre-line break-words text-[11px] text-slate-600 dark:text-slate-300/90">
              {event.description}
            </div>
          </div>
        )}

        {/* Status chip if in-progress or past */}
        {(() => {
          const nowMs = currentTime ? currentTime.getTime() : null
          const eventEndMs = new Date(event.end).getTime()
          const isPassed = nowMs !== null ? nowMs >= eventEndMs : false
          const isPast = event.isPast || isPassed
          const isInProgress = !isPassed && event.isInProgress

          if (isInProgress) {
            return (
              <div className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
                <Sparkles size={11} className="animate-spin text-emerald-500 dark:text-emerald-400" />
                <span>Currently happening</span>
              </div>
            )
          }
          if (isPast) {
            return (
              <div className="flex items-center gap-1 mt-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-400">
                <CheckCircle2 size={11} className="text-slate-400" />
                <span>Completed</span>
              </div>
            )
          }
          return null
        })()}

        {/* Hint */}
        <div className="mt-1.5 pt-1.5 border-t border-slate-200/80 dark:border-white/10 text-[10px] font-medium text-indigo-600 dark:text-indigo-300/80">
          Click to view full details
        </div>
      </div>
    </div>
  )
}
