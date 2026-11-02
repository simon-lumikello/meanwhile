import React, { useState, useMemo, useRef, useCallback } from 'react'
import type { SwimlaneConfig, TimelineOrientation, GridLineIntensity } from '@dashboard/features/settings'
import type { PositionedEvent } from './calendar'
import type { HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import { IconRenderer } from '@dashboard/components/common/IconRenderer'
import { EventCard } from './EventCard'
import { WeatherSwimlane } from './WeatherSwimlane'
import { Playhead } from './Playhead'
import { FloatingTooltip, type HoveredTooltipInfo } from './FloatingTooltip'
import { resolveVisibleLanes } from './mobileLayout'
import { getShortRainAlertLabel, type RainProximityAlert } from '@simon-lumikello/meanwhile-radar/core'
import { shouldDismissHoveredEvent } from './timelineMath'

interface TimelineGridProps {
  swimlanes: SwimlaneConfig[]
  eventsByLane: Record<string, PositionedEvent[]>
  weatherPoints: HourlyWeatherPoint[]
  isWeatherLoading?: boolean
  rainAlert?: RainProximityAlert | null
  orientation: TimelineOrientation
  playheadPercent: number | null
  currentTime: Date
  selectedDate?: Date
  mutePastEvents: boolean
  clock24h: boolean
  zebraStriping?: boolean
  gridLineIntensity?: GridLineIntensity
  isDark?: boolean
  onSelectEvent?: (event: PositionedEvent) => void
  isMobile?: boolean
  mobileSelectedIndex?: number
  mobileSelectedLaneIds?: string[]
  mobileLaneCount?: 1 | 2
  onMobileSwipeLane?: (direction: 'left' | 'right') => void
}

// 24-hour markers
const HOURS = Array.from({ length: 25 }, (_, i) => i)

const GRID_LINE_THEMES: Record<
  GridLineIntensity,
  {
    majorBorder: string
    minorBorder: string
    horizontalBorder: string
    swimlaneDivide: string
    axisRulerBorder: string
    majorTick: string
    minorTick: string
  }
> = {
  subtle: {
    majorBorder: 'border-slate-300/40 dark:border-white/[0.05]',
    minorBorder: 'border-slate-200/40 dark:border-white/[0.02]',
    horizontalBorder: 'border-slate-200/50 dark:border-white/[0.03]',
    swimlaneDivide: 'divide-slate-200/60 dark:divide-white/5',
    axisRulerBorder: 'border-slate-200 dark:border-white/5',
    majorTick: 'bg-slate-400 dark:bg-white/20',
    minorTick: 'bg-slate-300 dark:bg-white/10',
  },
  medium: {
    majorBorder: 'border-slate-300/70 dark:border-white/[0.14]',
    minorBorder: 'border-slate-200/70 dark:border-white/[0.06]',
    horizontalBorder: 'border-slate-200/80 dark:border-white/[0.08]',
    swimlaneDivide: 'divide-slate-200 dark:divide-white/10',
    axisRulerBorder: 'border-slate-200 dark:border-white/10',
    majorTick: 'bg-slate-500 dark:bg-white/40',
    minorTick: 'bg-slate-300 dark:bg-white/20',
  },
  vivid: {
    majorBorder: 'border-slate-400/80 dark:border-white/[0.25]',
    minorBorder: 'border-slate-300/80 dark:border-white/[0.12]',
    horizontalBorder: 'border-slate-300 dark:border-white/[0.16]',
    swimlaneDivide: 'divide-slate-300 dark:divide-white/20',
    axisRulerBorder: 'border-slate-300 dark:border-white/20',
    majorTick: 'bg-slate-700 dark:bg-white/70',
    minorTick: 'bg-slate-400 dark:bg-white/35',
  },
}

export const TimelineGrid: React.FC<TimelineGridProps> = ({
  swimlanes,
  eventsByLane,
  weatherPoints,
  isWeatherLoading,
  rainAlert,
  orientation,
  playheadPercent,
  currentTime,
  selectedDate,
  mutePastEvents,
  clock24h,
  zebraStriping = true,
  gridLineIntensity = 'medium',
  isDark = true,
  onSelectEvent,
  isMobile = false,
  mobileSelectedIndex = 0,
  mobileSelectedLaneIds,
  mobileLaneCount = 1,
  onMobileSwipeLane,
}) => {
  const dateKey = selectedDate
    ? `${selectedDate.getFullYear()}-${selectedDate.getMonth() + 1}-${selectedDate.getDate()}`
    : 'default'

  const [tooltipState, setTooltipState] = useState<{
    dateKey: string
    tooltip: HoveredTooltipInfo | null
  }>({
    dateKey,
    tooltip: null,
  })

  // Automatically reset hovered tooltip when viewing date changes without cascading renders
  const hoveredTooltip = tooltipState.dateKey === dateKey ? tooltipState.tooltip : null

  const setHoveredTooltip = useCallback(
    (tooltip: HoveredTooltipInfo | null) => {
      setTooltipState({ dateKey, tooltip })
    },
    [dateKey]
  )

  // Derive effective hovered tooltip: automatically dismiss once the event passes
  const activeTooltip = useMemo(() => {
    if (!hoveredTooltip) return null
    if (!('event' in hoveredTooltip)) return hoveredTooltip

    const latestEvent = eventsByLane[hoveredTooltip.event.swimlaneId]?.find(
      (e) => e.id === hoveredTooltip.event.id
    )

    if (shouldDismissHoveredEvent(hoveredTooltip.event, currentTime, latestEvent)) {
      return null
    }

    return hoveredTooltip
  }, [hoveredTooltip, eventsByLane, currentTime])

  const isHorizontal = orientation === 'horizontal'
  const activeLanes = useMemo(() => swimlanes.filter((l) => l.enabled), [swimlanes])
  const gridTheme = GRID_LINE_THEMES[gridLineIntensity] || GRID_LINE_THEMES.medium

  // On mobile: slice lanes to 1 or 2 according to selection; on desktop: show all lanes
  const visibleLanes = useMemo(() => {
    return resolveVisibleLanes({
      swimlanes: activeLanes,
      isMobile,
      mobileLaneCount,
      selectedLaneIds: mobileSelectedLaneIds,
      fallbackIndex: mobileSelectedIndex,
    })
  }, [activeLanes, isMobile, mobileLaneCount, mobileSelectedLaneIds, mobileSelectedIndex])

  // Touch swipe gesture detection for mobile lane switching
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || !touchStartRef.current) return
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const elapsed = Date.now() - touchStartRef.current.time

    touchStartRef.current = null

    // Threshold: swipe > 45px, predominantly horizontal, within 800ms
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3 && elapsed < 800) {
      if (deltaX < 0 && onMobileSwipeLane) {
        onMobileSwipeLane('right') // Swiped left -> advance to next lane
      } else if (deltaX > 0 && onMobileSwipeLane) {
        onMobileSwipeLane('left') // Swiped right -> go to previous lane
      }
    }
  }

  // Scroll container ref for auto-scrolling to playhead on mount / date change
  const verticalScrollRef = useRef<HTMLDivElement>(null)
  const playheadPercentRef = useRef<number | null>(playheadPercent)

  React.useEffect(() => {
    playheadPercentRef.current = playheadPercent
  }, [playheadPercent])

  React.useEffect(() => {
    if (isHorizontal || !verticalScrollRef.current) return
    const container = verticalScrollRef.current
    const timer = setTimeout(() => {
      const currentPct = playheadPercentRef.current
      if (currentPct !== null) {
        // Today: scroll playhead into view (around upper-middle of viewport)
        const target = (currentPct / 100) * container.scrollHeight - container.clientHeight / 3
        container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
      } else {
        // Other dates: scroll to morning (~07:30)
        const morningTarget = (7.5 / 24) * container.scrollHeight - 50
        container.scrollTo({ top: Math.max(0, morningTarget), behavior: 'smooth' })
      }
    }, 60)
    return () => clearTimeout(timer)
  }, [selectedDate, isHorizontal, isMobile])

  const formatHour = (h: number) => {
    if (clock24h) {
      return `${String(h).padStart(2, '0')}:00`
    }
    if (h === 0 || h === 24) return '12 AM'
    if (h === 12) return '12 PM'
    return h < 12 ? `${h} AM` : `${h - 12} PM`
  }

  if (isHorizontal) {
    return (
      <div
        className="relative flex flex-col flex-1 min-h-0 w-full overflow-hidden select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Top Time Scale Axis with distinct panel background */}
        <div className={`relative flex items-center h-11 border-b ${gridTheme.axisRulerBorder} bg-slate-100/90 dark:bg-[#0e1628] shrink-0 transition-colors`}>
          {/* Left spacer matching calendar title column */}
          <div className={`w-12 md:w-52 shrink-0 px-2 md:px-4 flex items-center h-full text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-r ${gridTheme.axisRulerBorder} bg-slate-100/90 dark:bg-[#0e1628] transition-colors`}>
            <span className="hidden md:inline">Calendars</span>
            <span className="md:hidden text-[10px]">Time</span>
          </div>

          {/* 24-hour horizontal ticks */}
          <div className="relative flex-1 h-full">
            {HOURS.map((hour) => {
              const pct = (hour / 24) * 100
              // On mobile, show labels every 4 hours to avoid colliding ticks; on desktop every 2 hours
              const isMajor = isMobile ? hour % 4 === 0 : hour % 2 === 0

              if (!isMajor) {
                return (
                  <div
                    key={hour}
                    className={`absolute bottom-0 -translate-x-1/2 w-[1px] h-2 ${gridTheme.minorTick}`}
                    style={{ left: `${pct}%` }}
                  />
                )
              }

              // Major hour ticks in a pill matching the panel background
              // 24:00 is right-aligned to avoid clipping off the screen edge; 00:00 is left-aligned
              const alignClass =
                hour === 0
                  ? 'translate-x-0'
                  : hour === 24
                  ? '-translate-x-full'
                  : '-translate-x-1/2'

              return (
                <div
                  key={hour}
                  className={`absolute top-1/2 -translate-y-1/2 ${alignClass} z-30 flex items-center pointer-events-none`}
                  style={{ left: `${pct}%` }}
                >
                  <div className="px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-full bg-white dark:bg-[#0e1628] border border-slate-200/90 dark:border-transparent shadow-2xs flex items-center justify-center transition-colors">
                    <span className="text-[10px] md:text-[11px] font-semibold tabular-numbers text-slate-700 dark:text-slate-300 leading-none">
                      {formatHour(hour)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Calendars Body */}
        <div className={`relative flex-1 flex flex-col divide-y ${gridTheme.swimlaneDivide} overflow-hidden`}>
          {/* Background vertical grid hour lines */}
          <div className="absolute inset-0 left-12 md:left-52 pointer-events-none z-0">
            {HOURS.map((hour) => {
              const pct = (hour / 24) * 100
              const isMajor = isMobile ? hour % 4 === 0 : hour % 2 === 0
              return (
                <div
                  key={hour}
                  className={`absolute top-0 bottom-0 border-r ${
                    isMajor ? gridTheme.majorBorder : gridTheme.minorBorder
                  }`}
                  style={{ left: `${pct}%` }}
                />
              )
            })}
          </div>

          {/* Render visible swimlanes */}
          {visibleLanes.map((lane, idx) => {
            const isWeather = lane.type === 'weather'
            const laneEvents = eventsByLane[lane.id] || []
            const isEven = idx % 2 === 0
            const zebraLaneBg = zebraStriping
              ? isEven
                ? 'bg-slate-100/50 dark:bg-slate-900/35'
                : 'bg-white/40 dark:bg-slate-950/20'
              : 'bg-transparent'
            const zebraHeaderBg = zebraStriping
              ? isEven
                ? 'bg-slate-100/90 group-hover/lane:bg-slate-100/95 dark:bg-slate-900/90 dark:group-hover/lane:bg-slate-900'
                : 'bg-white/95 group-hover/lane:bg-slate-50 dark:bg-slate-950/90 dark:group-hover/lane:bg-slate-950'
              : 'bg-white/90 group-hover/lane:bg-slate-50 dark:bg-slate-900/30 dark:group-hover/lane:bg-slate-900/50'

            return (
              <div
                key={lane.id}
                className={`relative flex ${isWeather ? 'z-[25]' : 'z-10'} group/lane transition-all ${zebraLaneBg} ${
                  isWeather ? 'flex-[0.5] min-h-[64px] max-h-[96px]' : 'flex-1 min-h-0'
                }`}
              >
                {/* Lane Header Card */}
                <div
                  className={`w-12 md:w-52 shrink-0 px-2 md:px-4 flex items-center justify-center md:justify-start gap-3 border-r ${gridTheme.axisRulerBorder} ${zebraHeaderBg} transition-colors ${
                    isWeather ? 'py-1.5' : 'py-2 md:py-3'
                  }`}
                  style={{ borderLeft: `3px solid ${lane.colorScheme.primary}` }}
                >
                  <div
                    className={`${
                      isWeather ? 'p-1 md:p-1.5 rounded-lg' : 'p-1.5 md:p-2 rounded-xl'
                    } flex items-center justify-center shrink-0 shadow-sm relative`}
                    style={{
                      backgroundColor: lane.colorScheme.secondary,
                      color: lane.colorScheme.primary,
                    }}
                    data-tooltip={isWeather && rainAlert ? rainAlert.summary : lane.title}
                  >
                    <IconRenderer name={lane.icon} size={isWeather ? 15 : 18} />
                    {isWeather && rainAlert && lane.source?.showRainAlerts !== false && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500 border border-white dark:border-slate-900" />
                      </span>
                    )}
                  </div>
                  <div className="hidden md:block min-w-0 flex-1">
                    <h3
                      className={`${
                        isWeather ? 'text-xs' : 'text-sm'
                      } font-bold text-slate-900 dark:text-slate-100 truncate`}
                    >
                      {lane.title}
                    </h3>
                    {isWeather && rainAlert && lane.source?.showRainAlerts !== false ? (
                      <div
                        className="inline-flex items-center w-fit max-w-full gap-1.5 mt-0.5 px-2 py-0.5 rounded-full bg-sky-500/15 dark:bg-sky-400/15 text-sky-700 dark:text-sky-300 border border-sky-400/40 text-[10px] font-semibold tracking-tight animate-pulse cursor-pointer"
                        data-tooltip={rainAlert.summary}
                      >
                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" />
                        </span>
                        <span className="truncate">{getShortRainAlertLabel(rainAlert)}</span>
                      </div>
                    ) : (
                      <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 capitalize truncate">
                        {isWeather ? 'Hourly Forecast' : `${laneEvents.length} events`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Lane Timeline Track */}
                <div className="relative flex-1 h-full overflow-hidden">
                  {isWeather ? (
                    <WeatherSwimlane
                      weatherPoints={weatherPoints}
                      orientation="horizontal"
                      isLoading={isWeatherLoading}
                      mutePastEvents={mutePastEvents}
                      playheadPercent={playheadPercent}
                      currentTime={currentTime}
                      targetDate={selectedDate}
                      colorScheme={lane.colorScheme}
                      isDark={isDark}
                      clock24h={clock24h}
                      onHoverPoint={setHoveredTooltip}
                    />
                  ) : (
                    laneEvents.map((evt) => (
                      <EventCard
                        key={`${dateKey}-${evt.id}`}
                        event={evt}
                        colorScheme={lane.colorScheme}
                        mutePastEvents={mutePastEvents}
                        orientation="horizontal"
                        clock24h={clock24h}
                        isDark={isDark}
                        onSelect={onSelectEvent}
                        onHover={setHoveredTooltip}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Full-Height Playhead Beam spanning across time ruler & lanes - unclipped */}
        {playheadPercent !== null && (
          <div className="absolute inset-0 left-12 md:left-52 pointer-events-none z-20">
            <Playhead
              percent={playheadPercent}
              currentTime={currentTime}
              orientation="horizontal"
              clock24h={clock24h}
            />
          </div>
        )}

        {/* Global Floating Tooltip with zero z-index clipping */}
        <FloatingTooltip info={activeTooltip} clock24h={clock24h} isDark={isDark} currentTime={currentTime} />
      </div>
    )
  }

  // Vertical Timeline Layout (Top to Bottom)
  return (
    <div
      className="flex flex-col flex-1 min-h-0 w-full overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Scrollable Vertical Container */}
      <div ref={verticalScrollRef} className="relative flex flex-1 min-h-0 overflow-y-auto">
        {/* Continuous Columns Container with Synchronized Dividers */}
        <div
          className={`relative flex flex-1 divide-x ${gridTheme.swimlaneDivide} ${
            isMobile ? 'min-h-[1200px]' : 'min-h-[1000px] [@media(min-height:750px)]:min-h-0'
          }`}
        >
          {/* Time Axis Column */}
          <div className={`w-14 md:w-24 shrink-0 flex flex-col border-r ${gridTheme.axisRulerBorder} bg-slate-100/90 dark:bg-[#0e1628] transition-colors`}>
            {/* Sticky Header */}
            <div className={`sticky top-0 z-40 h-11 md:h-12 flex items-center justify-center text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b ${gridTheme.axisRulerBorder} bg-slate-100/90 dark:bg-[#0e1628] shrink-0 shadow-xs transition-colors`}>
              Time
            </div>

            {/* Hour Ticks Track */}
            <div className="relative flex-1 w-full">
              {HOURS.map((hour) => {
                const pct = (hour / 24) * 100
                const isMajor = hour % 2 === 0

                if (!isMajor) {
                  return (
                    <div
                      key={hour}
                      className={`absolute right-0 -translate-y-1/2 h-[1px] w-1.5 md:w-2 ${gridTheme.minorTick}`}
                      style={{ top: `${pct}%` }}
                    />
                  )
                }

                const alignClass =
                  hour === 0
                    ? 'translate-y-0'
                    : hour === 24
                    ? '-translate-y-full'
                    : '-translate-y-1/2'

                return (
                  <div
                    key={hour}
                    className={`absolute left-0 right-0 ${alignClass} z-30 flex items-center justify-center pointer-events-none px-0.5 md:px-1.5`}
                    style={{ top: `${pct}%` }}
                  >
                    <div className="px-1 md:px-2.5 py-0.5 md:py-1 rounded-full bg-white dark:bg-[#0e1628] border border-slate-200/90 dark:border-transparent shadow-2xs flex items-center justify-center transition-colors">
                      <span className="text-[10px] md:text-[11px] font-semibold tabular-numbers text-slate-700 dark:text-slate-300 leading-none">
                        {formatHour(hour)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Active Swimlane Columns */}
          {visibleLanes.map((lane, idx) => {
            const isWeather = lane.type === 'weather'
            const laneEvents = eventsByLane[lane.id] || []
            const isEven = idx % 2 === 0
            const colBg = zebraStriping
              ? isEven
                ? 'bg-slate-100/50 dark:bg-slate-900/35'
                : 'bg-white/40 dark:bg-slate-950/20'
              : 'bg-transparent'
            const colHeaderBg = zebraStriping
              ? isEven
                ? 'bg-slate-100/95 group-hover/col:bg-slate-100 dark:bg-slate-900/95 dark:group-hover/col:bg-slate-900'
                : 'bg-white/95 group-hover/col:bg-slate-50 dark:bg-slate-950/95 dark:group-hover/col:bg-slate-950'
              : 'bg-white/95 group-hover/col:bg-slate-50 dark:bg-[#0e1628] dark:group-hover/col:bg-[#121c31]'

            return (
              <div
                key={lane.id}
                className={`min-w-0 flex flex-col group/col ${colBg} ${
                  isWeather
                    ? isMobile
                      ? 'flex-1 z-[25]'
                      : 'flex-[0.45] min-w-[220px] max-w-[280px] z-[25]'
                    : 'flex-1 z-10'
                }`}
              >
                {/* Sticky Header Cell for this Lane */}
                <div
                  className={`sticky top-0 z-40 h-11 md:h-12 px-2 md:px-4 flex items-center gap-1.5 md:gap-2 truncate border-b ${gridTheme.axisRulerBorder} ${colHeaderBg} shrink-0 shadow-xs transition-colors`}
                  style={{ borderTop: `2px solid ${lane.colorScheme.primary}` }}
                >
                  <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                    <div
                      className="p-1 md:p-1.5 rounded-lg shrink-0 relative"
                      style={{
                        backgroundColor: lane.colorScheme.secondary,
                        color: lane.colorScheme.primary,
                      }}
                      data-tooltip={isWeather && rainAlert ? rainAlert.summary : lane.title}
                    >
                      <IconRenderer name={lane.icon} size={14} />
                      {isWeather && rainAlert && lane.source?.showRainAlerts !== false && (
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-xs md:text-sm text-slate-900 dark:text-slate-200 truncate">
                      {lane.title}
                    </span>
                  </div>

                  {isWeather && rainAlert && lane.source?.showRainAlerts !== false && (
                    <div
                      className="ml-auto inline-flex items-center w-fit max-w-[140px] gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 dark:bg-sky-400/20 text-sky-700 dark:text-sky-300 border border-sky-400/40 text-[10px] font-semibold animate-pulse shrink-0 cursor-pointer"
                      data-tooltip={rainAlert.summary}
                    >
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" />
                      </span>
                      <span className="truncate">{getShortRainAlertLabel(rainAlert)}</span>
                    </div>
                  )}
                </div>

                {/* Body Canvas for this Lane */}
                <div className="relative flex-1 w-full z-10">
                  {isWeather ? (
                    <WeatherSwimlane
                      weatherPoints={weatherPoints}
                      orientation="vertical"
                      isLoading={isWeatherLoading}
                      mutePastEvents={mutePastEvents}
                      playheadPercent={playheadPercent}
                      currentTime={currentTime}
                      targetDate={selectedDate}
                      colorScheme={lane.colorScheme}
                      isDark={isDark}
                      clock24h={clock24h}
                      onHoverPoint={setHoveredTooltip}
                    />
                  ) : (
                    laneEvents.map((evt) => (
                      <EventCard
                        key={`${dateKey}-${evt.id}`}
                        event={evt}
                        colorScheme={lane.colorScheme}
                        mutePastEvents={mutePastEvents}
                        orientation="vertical"
                        clock24h={clock24h}
                        isDark={isDark}
                        onSelect={onSelectEvent}
                        onHover={setHoveredTooltip}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {/* Background horizontal hour lines across all swimlanes */}
          <div className="absolute top-11 md:top-12 bottom-0 left-14 md:left-24 right-0 pointer-events-none z-0">
            {HOURS.map((hour) => {
              const pct = (hour / 24) * 100
              const isMajor = hour % 2 === 0
              return (
                <div
                  key={hour}
                  className={`absolute left-0 right-0 border-b ${
                    isMajor ? gridTheme.majorBorder : gridTheme.minorBorder
                  }`}
                  style={{ top: `${pct}%` }}
                />
              )
            })}
          </div>

          {/* Full-Width Playhead Line across time axis and all lanes */}
          {playheadPercent !== null && (
            <div className="absolute top-11 md:top-12 bottom-0 left-0 right-0 pointer-events-none z-20">
              <Playhead
                percent={playheadPercent}
                currentTime={currentTime}
                orientation="vertical"
                clock24h={clock24h}
              />
            </div>
          )}
        </div>
      </div>

      {/* Global Floating Tooltip with zero z-index clipping */}
      <FloatingTooltip info={activeTooltip} clock24h={clock24h} isDark={isDark} currentTime={currentTime} />
    </div>
  )
}
