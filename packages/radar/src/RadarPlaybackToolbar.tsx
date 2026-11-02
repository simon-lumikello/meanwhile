import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, X } from 'lucide-react'
import { Button } from '@simon-lumikello/meanwhile-ui/react'
import { calculateRadarTimelineTicks } from './core'

export type RadarForecastStatus = 'off' | 'loading' | 'ready' | 'unavailable'

export interface RadarPlaybackToolbarProps {
  timestamps: string[]
  /** Index of the latest scan; later timestamps are forecast. Defaults to the last one. */
  nowIndex?: number
  playbackTime: string | null
  onTimeSelect: (time: string | null) => void
  isPlaying: boolean
  onPlayingChange: (playing: boolean) => void
  playbackSpeed?: number
  onSpeedChange?: (speed: number) => void
  onClose?: () => void
  isDark?: boolean
  /** Whether a forecast is on its way (the toolbar shows a skeleton), shown, or could not be made. */
  forecastStatus?: RadarForecastStatus
  /** A short note on the forecast, such as how the rain is moving. */
  forecastCaption?: string
  className?: string
}

const clock = (time: string) => new Date(time).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })

function formatLead(minutes: number): string {
  if (minutes < 60) return `+${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `+${hours} h ${rest} min` : `+${hours} h`
}

export const RadarPlaybackToolbar: React.FC<RadarPlaybackToolbarProps> = ({
  timestamps,
  nowIndex: requestedNowIndex,
  playbackTime,
  onTimeSelect,
  isPlaying,
  onPlayingChange,
  playbackSpeed = 600,
  onSpeedChange,
  onClose,
  isDark = true,
  forecastStatus = 'off',
  forecastCaption,
  className = '',
}) => {
  const lastIndex = timestamps.length - 1
  const nowIndex = Math.min(Math.max(0, requestedNowIndex ?? lastIndex), Math.max(0, lastIndex))
  const selectedIndex = playbackTime ? timestamps.indexOf(playbackTime) : -1
  const currentIndex = selectedIndex >= 0 ? selectedIndex : nowIndex

  const currentIndexRef = useRef(currentIndex)
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  const [lastScrubTime, setLastScrubTime] = useState(0)

  useEffect(() => {
    if (!isPlaying || timestamps.length === 0) return
    if (currentIndexRef.current >= timestamps.length - 1) {
      // If we hit play while at the very end, instantly rewind to the beginning
      currentIndexRef.current = 0
      onTimeSelect(timestamps[0])
    }
    const timer = window.setInterval(() => {
      const nextIdx = currentIndexRef.current + 1
      if (nextIdx >= timestamps.length) {
        // Finished playing the final frame: stop playback and remain on the final frame
        onPlayingChange(false)
      } else {
        currentIndexRef.current = nextIdx
        onTimeSelect(timestamps[nextIdx])
      }
    }, playbackSpeed) // dynamic frame duration
    return () => clearInterval(timer)
  }, [isPlaying, timestamps, onTimeSelect, onPlayingChange, playbackSpeed, lastScrubTime])

  const ticks = useMemo(() => calculateRadarTimelineTicks(timestamps, nowIndex), [timestamps, nowIndex])
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // Until the forecast is ready the whole timeline waits, rather than offering only the history.
  if (forecastStatus === 'loading') {
    const bone = isDark ? 'bg-slate-700/70' : 'bg-slate-200'
    return (
      <div
        data-testid="radar-timeline-skeleton"
        role="status"
        aria-label="Preparing the radar timeline"
        className={`h-14 px-2.5 rounded-xl flex items-center gap-2.5 backdrop-blur-md border shadow-sm select-none w-full animate-pulse ${
          isDark ? 'bg-slate-900/85 border-slate-700/60' : 'bg-white/90 border-slate-300 shadow-slate-300/30'
        } ${className}`}
      >
        <div className={`size-10 shrink-0 rounded-full ${bone}`} />
        <div className="w-[4.75rem] shrink-0 flex flex-col gap-1.5">
          <div className={`h-3 w-12 rounded ${bone}`} />
          <div className={`h-2 w-16 rounded ${bone}`} />
        </div>
        <div className={`flex-1 h-1.5 rounded-full ${bone}`} />
        {onClose && (
          <Button size="sm" variant="ghost" tone="neutral" onClick={onClose} title="Close timeline" aria-label="Close timeline" icon={<X />} pill />
        )}
      </div>
    )
  }

  if (timestamps.length === 0) return null

  const hasForecast = nowIndex < lastIndex
  const isForecast = currentIndex > nowIndex
  const isLive = currentIndex === nowIndex && !playbackTime
  const pctOf = (index: number) => (lastIndex > 0 ? (index / lastIndex) * 100 : 100)
  const currentPct = pctOf(currentIndex)
  const nowPct = pctOf(nowIndex)
  const leadMinutes = isForecast ? Math.round((Date.parse(timestamps[currentIndex]) - Date.parse(timestamps[nowIndex])) / 60_000) : 0

  const timeLabel = isForecast ? formatLead(leadMinutes) : currentIndex === nowIndex ? 'Now' : clock(timestamps[currentIndex])
  const caption = isForecast
    ? `Forecast ${clock(timestamps[currentIndex])}`
    : !isLive
      ? 'Radar scan'
      : forecastStatus === 'unavailable'
        ? 'No forecast'
        : forecastCaption ?? 'Latest scan'

  const select = (index: number) => {
    const clamped = Math.min(lastIndex, Math.max(0, index))
    // Now is the live view: the latest scan, refreshed as new ones arrive.
    onTimeSelect(clamped === nowIndex && !isPlaying ? null : timestamps[clamped])
    setLastScrubTime(Date.now())
  }
  const selectAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    select(Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * lastIndex))
  }

  const handlePlay = () => {
    if (isPlaying) {
      onPlayingChange(false)
      return
    }
    onPlayingChange(true)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (step) select(currentIndex + step)
    else if (event.key === 'Home') select(0)
    else if (event.key === 'End') select(lastIndex)
    else return
    event.preventDefault()
  }

  return (
    <div className={`@container h-14 px-2.5 rounded-xl flex items-center gap-2.5 backdrop-blur-md border shadow-sm select-none w-full ${
      isDark
        ? 'bg-slate-900/85 border-slate-700/60 text-slate-300'
        : 'bg-white/90 border-slate-300 text-slate-700 shadow-slate-300/30'
    } ${className}`}>
      <Button
        size="lg"
        variant="solid"
        tone={isForecast ? 'purple' : 'sky'}
        onClick={handlePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        icon={isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-0.5" />}
        pill
      />

      <div className="w-[4.75rem] shrink-0 flex flex-col leading-tight">
        <span data-testid="radar-timeline-time" className={`font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
          isForecast ? (isDark ? 'text-violet-300' : 'text-violet-600') : isDark ? 'text-sky-300' : 'text-sky-600'
        }`}>
          {timeLabel}
        </span>
        <span data-testid="radar-timeline-caption" className={`text-[9px] whitespace-nowrap overflow-hidden text-ellipsis ${
          isDark ? 'text-slate-400' : 'text-slate-500'
        }`} title={forecastCaption}>
          {caption}
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Radar timeline"
        aria-valuemin={0}
        aria-valuemax={lastIndex}
        aria-valuenow={currentIndex}
        aria-valuetext={isForecast ? `Forecast ${clock(timestamps[currentIndex])}, ${formatLead(leadMinutes)}` : timeLabel === 'Now' ? 'Now' : `Radar scan ${timeLabel}`}
        className="flex-1 min-w-0 flex flex-col justify-center h-8 relative group cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 rounded"
        onPointerDown={event => {
          draggingRef.current = true
          event.currentTarget.setPointerCapture?.(event.pointerId)
          selectAt(event.clientX)
        }}
        onPointerMove={event => { if (draggingRef.current) selectAt(event.clientX) }}
        onPointerUp={() => { draggingRef.current = false }}
        onPointerCancel={() => { draggingRef.current = false }}
        onKeyDown={handleKeyDown}
      >
        {/* Track Base */}
        <div className={`absolute left-0 right-0 h-1.5 top-1/2 -translate-y-1/2 rounded-full ${
          isDark ? 'bg-slate-700/80' : 'bg-slate-200'
        }`} />

        {/* Forecast stretch, after Now */}
        {hasForecast && (
          <div
            data-testid="radar-timeline-forecast"
            title={forecastCaption ? `Forecast · ${forecastCaption}` : 'Forecast'}
            className="absolute h-1.5 top-1/2 -translate-y-1/2 right-0 rounded-r-full bg-[repeating-linear-gradient(90deg,rgba(167,139,250,0.55)_0_4px,rgba(167,139,250,0.2)_4px_7px)]"
            style={{ left: `${nowPct}%` }}
          />
        )}

        {/* Ticks (Rendered BEFORE Track Fill so they appear underneath the blue active area) */}
        {ticks.map((tick, i) => {
          const alignClass = tick.pct === 0 ? 'translate-x-0' : tick.pct === 100 ? '-translate-x-full' : '-translate-x-1/2'
          return (
            <div key={i} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${tick.pct}%` }}>
              <div className={`absolute top-[11px] w-0.5 -ml-[1px] ${
                tick.isMajor
                  ? isDark ? 'bg-slate-400 h-[8px]' : 'bg-slate-500 h-[8px]'
                  : isDark ? 'bg-slate-600/60 h-[5px]' : 'bg-slate-300 h-[5px]'
              }`} />
              {/* Narrow toolbars keep only Now; clock labels would run together. */}
              {tick.label && (
                <div className={`absolute top-[22px] ${alignClass} ${tick.label === 'Now' ? '' : 'hidden @sm:block'} text-[9px] font-mono font-medium whitespace-nowrap ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  {tick.label}
                </div>
              )}
            </div>
          )
        })}

        {/* Track Fill: scans in sky, forecast in violet */}
        <div className="absolute left-0 h-1.5 top-1/2 -translate-y-1/2 rounded-l-full bg-sky-400 pointer-events-none"
             style={{ width: `${Math.min(currentPct, nowPct)}%` }} />
        {isForecast && (
          <div className="absolute h-1.5 top-1/2 -translate-y-1/2 bg-violet-400 pointer-events-none"
               style={{ left: `${nowPct}%`, width: `${currentPct - nowPct}%` }} />
        )}

        {/* Playhead */}
        <div className={`absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 rounded-full bg-white border-2 shadow-sm pointer-events-none transition-transform group-hover:scale-110 ${
          isForecast ? 'border-violet-400' : 'border-sky-400'
        }`}
             style={{ left: `${currentPct}%` }} />
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {onSpeedChange && (
        <div className={`hidden @md:flex items-center gap-0.5 rounded-md p-0.5 ${
          isDark ? 'bg-slate-900 border border-slate-800' : 'bg-slate-100 border border-slate-200'
        }`}>
          {[600, 300, 150].map((speedMs) => {
            const isActive = playbackSpeed === speedMs;
            const label = speedMs === 600 ? '1x' : speedMs === 300 ? '2x' : '4x';
            return (
              <button
                key={speedMs}
                type="button"
                onClick={() => onSpeedChange(speedMs)}
                className={`px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-sky-500 text-white shadow-sm'
                    : isDark
                      ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                }`}
                title={`Speed: ${label}`}
                aria-pressed={isActive}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {onClose && (
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          onClick={onClose}
          title="Close timeline"
          aria-label="Close timeline"
          icon={<X />}
          pill
        />
      )}
      </div>
    </div>
  )
}
