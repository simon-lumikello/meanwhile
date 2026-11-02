import React, { useRef, useState, useLayoutEffect, useMemo } from 'react'
import { AlertTriangle, ArrowUp, ArrowDown, Droplets } from 'lucide-react'
import type { HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import type { TimelineOrientation, SwimlaneColorScheme } from '@dashboard/features/settings'
import { renderWeatherIcon } from '@simon-lumikello/meanwhile-weather/react'
import { calculateDaylightWindow } from '@simon-lumikello/meanwhile-weather/core'
import {
  getNearestPastWeatherPoint,
  getWeatherPointVisibility,
  calculatePrecipitationBarHeight,
} from './weatherSwimlaneData'

/** Dashboard timeline presentation data; not part of the weather domain model. */
export interface HoveredWeatherInfo {
  point: HourlyWeatherPoint
  colorScheme: SwimlaneColorScheme
  rect: DOMRect
}

interface WeatherSwimlaneProps {
  weatherPoints: HourlyWeatherPoint[]
  orientation: TimelineOrientation
  isLoading?: boolean
  mutePastEvents?: boolean
  playheadPercent?: number | null
  currentTime?: Date
  targetDate?: Date
  colorScheme?: SwimlaneColorScheme
  isDark?: boolean
  clock24h?: boolean
  onHoverPoint?: (info: HoveredWeatherInfo | null) => void
}

export const WeatherSwimlane: React.FC<WeatherSwimlaneProps> = ({
  weatherPoints,
  orientation,
  isLoading = false,
  mutePastEvents = true,
  playheadPercent = null,
  currentTime,
  targetDate,
  colorScheme = {
    primary: '#06b6d4',
    secondary: 'rgba(6, 182, 212, 0.16)',
    accent: '#22d3ee',
    text: '#ffffff',
  },
  isDark = true,
  clock24h = true,
  onHoverPoint,
}) => {
  const isHorizontal = orientation === 'horizontal'
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  useLayoutEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    }
    updateSize()

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Peak precipitation across timeline points to dynamically anchor rain bar scale
  const maxTimelinePrecip = useMemo(() => {
    let max = 0
    for (const pt of weatherPoints) {
      if (pt.precipitationMm && pt.precipitationMm > max) {
        max = pt.precipitationMm
      }
    }
    return max
  }, [weatherPoints])

  // Intelligently cluster weather points based on container dimension to prevent overlapping icons
  const clusteredPoints = useMemo(() => {
    if (weatherPoints.length === 0) return []

    // Minimum required pixels per point so badges never collide
    const minSpacing = isHorizontal ? 56 : 34
    const availablePx = isHorizontal
      ? containerSize.width || (typeof window !== 'undefined' ? window.innerWidth : 1200)
      : containerSize.height || (typeof window !== 'undefined' ? window.innerHeight : 800)

    const maxItems = Math.max(1, Math.floor(availablePx / minSpacing))

    // Step sizes in hours: [1, 2, 3, 4, 6, 8, 12]
    const candidateSteps = [1, 2, 3, 4, 6, 8, 12]
    const neededStep = 24 / maxItems
    const stepHours = candidateSteps.find((s) => s >= neededStep) || 12

    if (stepHours === 1 && weatherPoints.length <= 24) {
      return weatherPoints.map((pt) => {
        const d = new Date(pt.time)
        const totalMinutes = d.getHours() * 60 + d.getMinutes()
        return {
          point: pt,
          percent: (totalMinutes / 1440) * 100,
        }
      })
    }

    // Bucket points by stepHours interval: [0..step), [step..2*step), etc.
    const buckets: Record<number, HourlyWeatherPoint[]> = {}
    for (const pt of weatherPoints) {
      const d = new Date(pt.time)
      const hour = d.getHours()
      const bucketIdx = Math.floor(hour / stepHours)
      if (!buckets[bucketIdx]) buckets[bucketIdx] = []
      buckets[bucketIdx].push(pt)
    }

    const result: { point: HourlyWeatherPoint; percent: number }[] = []
    const totalBuckets = Math.ceil(24 / stepHours)

    for (let b = 0; b < totalBuckets; b++) {
      const pts = buckets[b]
      if (!pts || pts.length === 0) continue

      const targetHour = b * stepHours
      const bucketPercent = (targetHour / 24) * 100

      // Priority in bucket:
      // 1. Storm warning
      // 2. Highest precipitation (break ties by proximity to bucket target hour)
      // 3. Closest to bucket anchor hour (comparing minutes)
      const stormPt = pts.find((p) => p.isStormWarning || (p.windSpeedMs && p.windSpeedMs >= 14))
      const rainPt = [...pts]
        .filter((p) => p.precipitationMm > 0)
        .sort((a, b) => {
          if (b.precipitationMm !== a.precipitationMm) {
            return b.precipitationMm - a.precipitationMm
          }
          const diffA = Math.abs((new Date(a.time).getHours() * 60 + new Date(a.time).getMinutes()) - targetHour * 60)
          const diffB = Math.abs((new Date(b.time).getHours() * 60 + new Date(b.time).getMinutes()) - targetHour * 60)
          return diffA - diffB
        })[0]

      const bestPt = pts.reduce((prev, curr) => {
        const prevD = new Date(prev.time)
        const currD = new Date(curr.time)
        const prevDiff = Math.abs((prevD.getHours() * 60 + prevD.getMinutes()) - targetHour * 60)
        const currDiff = Math.abs((currD.getHours() * 60 + currD.getMinutes()) - targetHour * 60)
        return currDiff < prevDiff ? curr : prev
      }, pts[0])

      const selected = stormPt || rainPt || bestPt
      const anchorDate = new Date(selected.time)
      anchorDate.setHours(targetHour, 0, 0, 0)

      result.push({
        point: {
          ...selected,
          time: anchorDate.toISOString(),
        },
        percent: bucketPercent,
      })
    }

    return result
  }, [weatherPoints, isHorizontal, containerSize.width, containerSize.height])

  const daylightWindow = useMemo(() => {
    return calculateDaylightWindow(weatherPoints, { clock24h, targetDate })
  }, [weatherPoints, clock24h, targetDate])

  const currentMinutes = useMemo(() => {
    if (playheadPercent === null) return 0
    return currentTime
      ? currentTime.getHours() * 60 + currentTime.getMinutes()
      : Math.round((playheadPercent / 100) * 1440)
  }, [playheadPercent, currentTime])

  const nearestPastPoint = useMemo(() => {
    if (playheadPercent === null) return null
    return getNearestPastWeatherPoint(clusteredPoints, currentMinutes)
  }, [clusteredPoints, playheadPercent, currentMinutes])

  if (isLoading && weatherPoints.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 animate-pulse">
        Fetching live weather forecast...
      </div>
    )
  }

  if (weatherPoints.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400/80 dark:text-slate-500/70 italic">
        No forecast data available for this date
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Daylight / Night subtle indication backdrop */}
      {daylightWindow && daylightWindow.hasDaylight && !daylightWindow.isPolarDay && (
        isHorizontal ? (
          <>
            {/* Background wash & illuminated daylight band */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
              {/* Night Backdrop (early morning: 0% to startPercent%) */}
              {daylightWindow.startPercent > 0 && (
                <div
                  className={`absolute top-0 bottom-0 left-0 transition-colors ${
                    isDark ? 'bg-slate-950/30' : 'bg-slate-900/[0.025]'
                  }`}
                  style={{ width: `${daylightWindow.startPercent}%` }}
                />
              )}

              {/* Daytime Illuminated Track Band (startPercent% to endPercent%) */}
              <div
                className={`absolute top-0 bottom-0 transition-all ${
                  isDark
                    ? 'bg-gradient-to-b from-amber-400/[0.08] via-amber-300/[0.035] to-amber-400/[0.08] border-y border-amber-400/35 shadow-[inset_0_0_24px_rgba(251,191,36,0.03)]'
                    : 'bg-gradient-to-b from-amber-200/25 via-amber-100/15 to-amber-200/25 border-y border-amber-400/40 shadow-[inset_0_0_24px_rgba(245,158,11,0.05)]'
                }`}
                style={{
                  left: `${daylightWindow.startPercent}%`,
                  width: `${Math.max(0, daylightWindow.endPercent - daylightWindow.startPercent)}%`,
                }}
              />

              {/* Night Backdrop (late evening: endPercent% to 100%) */}
              {daylightWindow.endPercent < 100 && (
                <div
                  className={`absolute top-0 bottom-0 right-0 transition-colors ${
                    isDark ? 'bg-slate-950/30' : 'bg-slate-900/[0.025]'
                  }`}
                  style={{ width: `${100 - daylightWindow.endPercent}%` }}
                />
              )}
            </div>

            {/* Sunrise Edge Vertical Line (z-0, stays behind weather pills) */}
            {daylightWindow.startPercent > 0 && (
              <div
                className="absolute inset-y-0 w-px -translate-x-1/2 bg-gradient-to-b from-amber-400/60 via-amber-300/30 to-amber-500/15 shadow-[0_0_6px_rgba(251,191,36,0.35)] pointer-events-none z-0"
                style={{ left: `${daylightWindow.startPercent}%` }}
              />
            )}

            {/* Sunrise Compact Icon Pill & Tooltip (z-[5] idle so weather pills stay on top, elevates to z-50 on hover so tooltip is always on top) */}
            {daylightWindow.startPercent > 0 && (
              <div
                className="absolute top-0 bottom-0 -translate-x-1/2 flex items-center justify-center z-[5] hover:z-50 focus-within:z-50 has-[:hover]:z-50 pointer-events-none"
                style={{ left: `${daylightWindow.startPercent}%` }}
              >
                <div
                  className="group/sunrise relative flex items-center justify-center pointer-events-auto cursor-pointer"
                >
                  <div
                    className="w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-amber-400/40 dark:border-amber-400/35 shadow-2xs hover:border-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-md hover:shadow-amber-400/25 flex items-center justify-center transition-all select-none"
                    title={daylightWindow.sunriseLabel ? `Sunrise: ${daylightWindow.sunriseLabel}` : 'Sunrise'}
                    aria-label={daylightWindow.sunriseLabel ? `Sunrise: ${daylightWindow.sunriseLabel}` : 'Sunrise'}
                  >
                    <ArrowUp size={14} strokeWidth={2.5} className="text-amber-500 dark:text-amber-400" />
                  </div>
                  {daylightWindow.sunriseLabel && (
                    <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/sunrise:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/95 dark:bg-slate-950/95 border border-amber-400/50 shadow-xl backdrop-blur-md text-[11px] font-bold tabular-numbers text-amber-300 whitespace-nowrap">
                      <span>Sunrise</span>
                      <span>{daylightWindow.sunriseLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sunset Edge Vertical Line (z-0, stays behind weather pills) */}
            {daylightWindow.endPercent < 100 && (
              <div
                className="absolute inset-y-0 w-px -translate-x-1/2 bg-gradient-to-b from-amber-400/60 via-amber-300/30 to-amber-500/15 shadow-[0_0_6px_rgba(251,191,36,0.35)] pointer-events-none z-0"
                style={{ left: `${daylightWindow.endPercent}%` }}
              />
            )}

            {/* Sunset Compact Icon Pill & Tooltip (z-[5] idle so weather pills stay on top, elevates to z-50 on hover so tooltip is always on top) */}
            {daylightWindow.endPercent < 100 && (
              <div
                className="absolute top-0 bottom-0 -translate-x-1/2 flex items-center justify-center z-[5] hover:z-50 focus-within:z-50 has-[:hover]:z-50 pointer-events-none"
                style={{ left: `${daylightWindow.endPercent}%` }}
              >
                <div
                  className="group/sunset relative flex items-center justify-center pointer-events-auto cursor-pointer"
                >
                  <div
                    className="w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-amber-400/40 dark:border-amber-400/35 shadow-2xs hover:border-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-md hover:shadow-amber-400/25 flex items-center justify-center transition-all select-none"
                    title={daylightWindow.sunsetLabel ? `Sunset: ${daylightWindow.sunsetLabel}` : 'Sunset'}
                    aria-label={daylightWindow.sunsetLabel ? `Sunset: ${daylightWindow.sunsetLabel}` : 'Sunset'}
                  >
                    <ArrowDown size={14} strokeWidth={2.5} className="text-amber-500 dark:text-amber-400" />
                  </div>
                  {daylightWindow.sunsetLabel && (
                    <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover/sunset:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/95 dark:bg-slate-950/95 border border-amber-400/50 shadow-xl backdrop-blur-md text-[11px] font-bold tabular-numbers text-amber-300 whitespace-nowrap">
                      <span>Sunset</span>
                      <span>{daylightWindow.sunsetLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
              {/* Vertical Night Backdrop (early morning) */}
              {daylightWindow.startPercent > 0 && (
                <div
                  className={`absolute top-0 left-0 right-0 transition-colors ${
                    isDark ? 'bg-slate-950/30' : 'bg-slate-900/[0.025]'
                  }`}
                  style={{ height: `${daylightWindow.startPercent}%` }}
                />
              )}

              {/* Vertical Daytime Illuminated Track Band */}
              <div
                className={`absolute left-0 right-0 transition-all ${
                  isDark
                    ? 'bg-gradient-to-r from-amber-400/[0.08] via-amber-300/[0.035] to-amber-400/[0.08] border-x border-amber-400/35 shadow-[inset_0_0_24px_rgba(251,191,36,0.03)]'
                    : 'bg-gradient-to-r from-amber-200/25 via-amber-100/15 to-amber-200/25 border-x border-amber-400/40 shadow-[inset_0_0_24px_rgba(245,158,11,0.05)]'
                }`}
                style={{
                  top: `${daylightWindow.startPercent}%`,
                  height: `${Math.max(0, daylightWindow.endPercent - daylightWindow.startPercent)}%`,
                }}
              />

              {/* Vertical Night Backdrop (late evening) */}
              {daylightWindow.endPercent < 100 && (
                <div
                  className={`absolute bottom-0 left-0 right-0 transition-colors ${
                    isDark ? 'bg-slate-950/30' : 'bg-slate-900/[0.025]'
                  }`}
                  style={{ height: `${100 - daylightWindow.endPercent}%` }}
                />
              )}
            </div>

            {/* Vertical Sunrise Horizontal Line (z-0, behind weather pills) */}
            {daylightWindow.startPercent > 0 && (
              <div
                className="absolute inset-x-0 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-amber-400/50 to-amber-300/60 shadow-[0_0_6px_rgba(251,191,36,0.35)] pointer-events-none z-0"
                style={{ top: `${daylightWindow.startPercent}%` }}
              />
            )}

            {/* Vertical Sunrise Horizontal Badge (z-[5] idle, z-50 on hover) */}
            {daylightWindow.startPercent > 0 && (
              <div
                className="absolute left-0 right-0 -translate-y-1/2 flex items-center justify-center px-2 z-[5] hover:z-50 focus-within:z-50 has-[:hover]:z-50 pointer-events-none"
                style={{ top: `${daylightWindow.startPercent}%` }}
              >
                <div className="group/sunrise relative flex items-center justify-center pointer-events-auto cursor-pointer">
                  <div
                    className="w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-amber-400/40 dark:border-amber-400/35 shadow-2xs hover:border-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-md hover:shadow-amber-400/25 flex items-center justify-center transition-all select-none"
                    title={daylightWindow.sunriseLabel ? `Sunrise: ${daylightWindow.sunriseLabel}` : 'Sunrise'}
                    aria-label={daylightWindow.sunriseLabel ? `Sunrise: ${daylightWindow.sunriseLabel}` : 'Sunrise'}
                  >
                    <ArrowUp size={14} strokeWidth={2.5} className="text-amber-500 dark:text-amber-400" />
                  </div>
                  {daylightWindow.sunriseLabel && (
                    <div className="absolute left-full ml-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/sunrise:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/95 dark:bg-slate-950/95 border border-amber-400/50 shadow-xl backdrop-blur-md text-[11px] font-bold tabular-numbers text-amber-300 whitespace-nowrap">
                      <span>Sunrise</span>
                      <span>{daylightWindow.sunriseLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Vertical Sunset Horizontal Line (z-0, behind weather pills) */}
            {daylightWindow.endPercent < 100 && (
              <div
                className="absolute inset-x-0 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-amber-400/50 to-amber-300/60 shadow-[0_0_6px_rgba(251,191,36,0.35)] pointer-events-none z-0"
                style={{ top: `${daylightWindow.endPercent}%` }}
              />
            )}

            {/* Vertical Sunset Horizontal Badge (z-[5] idle, z-50 on hover) */}
            {daylightWindow.endPercent < 100 && (
              <div
                className="absolute left-0 right-0 -translate-y-1/2 flex items-center justify-center px-2 z-[5] hover:z-50 focus-within:z-50 has-[:hover]:z-50 pointer-events-none"
                style={{ top: `${daylightWindow.endPercent}%` }}
              >
                <div className="group/sunset relative flex items-center justify-center pointer-events-auto cursor-pointer">
                  <div
                    className="w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-amber-400/40 dark:border-amber-400/35 shadow-2xs hover:border-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-md hover:shadow-amber-400/25 flex items-center justify-center transition-all select-none"
                    title={daylightWindow.sunsetLabel ? `Sunset: ${daylightWindow.sunsetLabel}` : 'Sunset'}
                    aria-label={daylightWindow.sunsetLabel ? `Sunset: ${daylightWindow.sunsetLabel}` : 'Sunset'}
                  >
                    <ArrowDown size={14} strokeWidth={2.5} className="text-amber-500 dark:text-amber-400" />
                  </div>
                  {daylightWindow.sunsetLabel && (
                    <div className="absolute left-full ml-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/sunset:opacity-100 pointer-events-none transition-opacity duration-150 z-50 flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/95 dark:bg-slate-950/95 border border-amber-400/50 shadow-xl backdrop-blur-md text-[11px] font-bold tabular-numbers text-amber-300 whitespace-nowrap">
                      <span>Sunset</span>
                      <span>{daylightWindow.sunsetLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )
      )}

      {/* Polar day full wash */}
      {daylightWindow && daylightWindow.isPolarDay && (
        <div
          className={`absolute inset-0 pointer-events-none z-0 ${
            isDark
              ? 'bg-gradient-to-b from-amber-400/[0.06] to-amber-300/[0.04] border-y border-amber-400/15'
              : 'bg-gradient-to-b from-amber-200/20 to-amber-100/10 border-y border-amber-300/30'
          }`}
        />
      )}

      {/* Polar night full tint */}
      {daylightWindow && daylightWindow.isPolarNight && (
        <div
          className={`absolute inset-0 pointer-events-none z-0 ${
            isDark ? 'bg-slate-950/40' : 'bg-slate-900/[0.04]'
          }`}
        />
      )}
      {clusteredPoints.map(({ point, percent }) => {
        const isNearestPast =
          nearestPastPoint === point ||
          (nearestPastPoint !== null && point.time === nearestPastPoint.time)
        const { isVisible, isMuted } = getWeatherPointVisibility({
          pointTime: point.time,
          percent,
          isToday: playheadPercent !== null,
          currentMinutes,
          isNearestPast,
          targetDate,
          mutePastEvents,
        })

        if (!isVisible) {
          return null
        }

        const hasRain = point.precipitationMm > 0
        const isStorm = point.isStormWarning || (point.windSpeedMs && point.windSpeedMs >= 14)

        if (isHorizontal) {
          return (
            <div
              key={point.time}
              className={`absolute top-1 bottom-1 -translate-x-1/2 flex flex-col items-center justify-between text-center pointer-events-none transition-all duration-200 z-10 hover:z-20 has-[:hover]:z-20 animate-event-fade-in ${
                isMuted ? 'opacity-35 grayscale contrast-75 hover:opacity-100 hover:grayscale-0' : ''
              }`}
              style={{
                left: `${percent}%`,
                '--target-opacity': isMuted ? 0.35 : 1,
              } as React.CSSProperties}
            >
              {/* Temperature & Icon Pill - only the pill itself intercepts hover and shows tooltip */}
              <div
                className="flex items-center gap-1 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded-full border border-slate-200/90 dark:border-white/10 shadow-2xs hover:border-cyan-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-md hover:shadow-cyan-500/25 transition-all pointer-events-auto cursor-pointer"
                onMouseEnter={(e) =>
                  onHoverPoint?.({
                    point,
                    colorScheme,
                    rect: e.currentTarget.getBoundingClientRect(),
                  })
                }
                onMouseLeave={() => onHoverPoint?.(null)}
              >
                {renderWeatherIcon(point.symbol, 14)}
                <span className="text-xs font-bold tabular-numbers text-slate-800 dark:text-slate-200">
                  {Math.round(point.temperature)}°
                </span>
              </div>

              {/* Storm Warning Badge if active */}
              {isStorm && (
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40 text-[10px] font-bold animate-pulse pointer-events-none">
                  <AlertTriangle size={10} className="text-rose-500 dark:text-rose-400" />
                  <span>{Math.round(point.windSpeedMs || 14)}m/s</span>
                </div>
              )}

              {/* Precipitation Pillar Bar (Dynamic scaling) */}
              <div className="flex flex-col items-center justify-end w-4 h-5.5 pointer-events-none">
                {hasRain ? (
                  <div className="w-full flex-1 flex items-end justify-center min-h-0">
                    <div
                      className={`w-2 rounded-t transition-all ${
                        point.precipitationMm > 2
                          ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]'
                          : point.precipitationMm > 0.5
                          ? 'bg-sky-400 shadow-[0_0_4px_rgba(56,189,248,0.6)]'
                          : 'bg-sky-400/50'
                      }`}
                      style={{
                        height: `${calculatePrecipitationBarHeight(point.precipitationMm, maxTimelinePrecip)}%`,
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-800" />
                )}
                {hasRain && (
                  <span className="text-[9px] font-semibold text-sky-600 dark:text-sky-300 tabular-numbers leading-none shrink-0 mt-0.5">
                    {point.precipitationMm}
                  </span>
                )}
              </div>
            </div>
          )
        }

        // Vertical layout
        return (
          <div
            key={point.time}
            className={`absolute left-1 right-1 -translate-y-1/2 flex items-center justify-between px-3 pointer-events-none transition-all duration-200 z-10 hover:z-20 has-[:hover]:z-20 animate-event-fade-in ${
              isMuted ? 'opacity-35 grayscale contrast-75 hover:opacity-100 hover:grayscale-0' : ''
            }`}
            style={{
              top: `${percent}%`,
              '--target-opacity': isMuted ? 0.35 : 1,
            } as React.CSSProperties}
          >
            <div
              className="flex items-center gap-2 shrink-0 bg-white/90 dark:bg-slate-900/90 px-2 py-0.5 rounded-full border border-slate-200/90 dark:border-white/10 shadow-2xs hover:border-cyan-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all pointer-events-auto cursor-pointer"
              onMouseEnter={(e) =>
                onHoverPoint?.({
                  point,
                  colorScheme,
                  rect: e.currentTarget.getBoundingClientRect(),
                })
              }
              onMouseLeave={() => onHoverPoint?.(null)}
            >
              {renderWeatherIcon(point.symbol, 16)}
              <span className="text-xs font-bold tabular-numbers text-slate-800 dark:text-slate-200">
                {Math.round(point.temperature)}°C
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 pointer-events-none">
              {isStorm && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-500/40">
                  <AlertTriangle size={11} />
                  <span>{Math.round(point.windSpeedMs || 14)} m/s</span>
                </span>
              )}

              {hasRain && (
                <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 tabular-numbers bg-sky-100/90 dark:bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-200/80 dark:border-transparent inline-flex items-center gap-1">
                  <Droplets size={10} className="shrink-0" />
                  <span>{point.precipitationMm}mm ({point.precipitationProbability || 0}%)</span>
                </span>
              )}
            </div>
          </div>
        )
      })}

    </div>
  )
}
