import type { CSSProperties, ReactNode } from 'react'
import { useMemo } from 'react'
import { Droplets, Wind, AlertTriangle, Calendar, CalendarDays, ChevronDown, MapPin } from 'lucide-react'
import { format, addDays } from 'date-fns'
import type { AuroraVisibilityStatus, DailyOutlook, HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import { isSkyFavorableForAurora } from '@simon-lumikello/meanwhile-weather/core'
import { renderWeatherIcon } from '@simon-lumikello/meanwhile-weather/react'
import {
  calculateRestOfTodayForecast,
  calculateTomorrowForecast,
  getWeatherSymbolLabel,
} from '@simon-lumikello/meanwhile-weather/core'
import {
  calculateWeekOutlookHeight,
  shouldPresentRadarInWeatherRow,
  shouldCompactClockForStackedRadar,
  shouldHideStackedRadarCard,
  shouldUseCompactClock,
} from './core'

/** Days the week outlook shows after Today and Tomorrow, completing a week. */
const WEEK_OUTLOOK_DAYS = 5

export interface AmbientViewProps {
  currentTime: Date
  /** Optional location label displayed alongside the date under the clock. */
  location?: string
  isDimmed?: boolean
  cardDim?: number       // 20-100%, default 70
  todayWeather?: HourlyWeatherPoint[]
  tomorrowWeather?: HourlyWeatherPoint[]
  /** Day summaries after tomorrow; the first five form the week outlook row. */
  weekForecast?: DailyOutlook[]
  /** Shows the week outlook row under the Today and Tomorrow cards. */
  showWeek?: boolean
  /** When given, a subtle on-screen toggle switches the week outlook. Omit it where any input dismisses the view. */
  onShowWeekChange?: (showWeek: boolean) => void
  clock24h?: boolean
  auroraStatus?: AuroraVisibilityStatus
  rainAlert?: { summary: string } | null
  radarSlot?: ReactNode
  forecastState?: 'ready' | 'loading' | 'unavailable'
  theme?: 'dark' | 'light'
  className?: string
}

export function AmbientView({
  currentTime,
  location,
  isDimmed = true,
  cardDim = 70,
  todayWeather = [],
  tomorrowWeather = [],
  weekForecast,
  showWeek = false,
  onShowWeekChange,
  clock24h = true,
  auroraStatus,
  rainAlert,
  radarSlot,
  forecastState = 'ready',
  theme = 'dark',
  className,
}: AmbientViewProps) {
  const displayLocation = location?.trim() || undefined

  const curHour = currentTime.getHours()

  // Only recalculate today's dimmer forecast once per minute or when forecast updates, not every 1-second clock tick
  const currentMinuteMs = Math.floor(currentTime.getTime() / 60000) * 60000
  const currentMinute = useMemo(() => new Date(currentMinuteMs), [currentMinuteMs])

  const todayForecast = useMemo(
    () => calculateRestOfTodayForecast(todayWeather, currentMinute),
    [todayWeather, currentMinute],
  )

  const tomorrowForecast = useMemo(
    () => calculateTomorrowForecast(tomorrowWeather),
    [tomorrowWeather],
  )

  const showRainTimeline = Boolean(
    todayForecast?.hasRain || tomorrowForecast?.hasRain,
  )

  const tomorrowKey = format(addDays(currentTime, 1), 'yyyy-MM-dd')
  const weekDays = useMemo(
    () => (weekForecast ?? []).filter((day) => day.date > tomorrowKey).slice(0, WEEK_OUTLOOK_DAYS),
    [weekForecast, tomorrowKey],
  )
  const isWeekShown = showWeek && weekDays.length > 0
  const hasWeekToggle = Boolean(onShowWeekChange)
  const extraHeight = calculateWeekOutlookHeight({ isWeekShown, hasWeekToggle })
  // With an on-screen toggle, the radar's place (in the row or below the cards) is chosen as if
  // the week were shown, so toggling it never moves the radar between rows: the stacked radar
  // only grows or shrinks along with the week row's animation.
  const placementExtraHeight = hasWeekToggle
    ? calculateWeekOutlookHeight({ isWeekShown: true, hasWeekToggle })
    : extraHeight

  const hasWindow = typeof window !== 'undefined'
  const windowWidth = hasWindow ? window.innerWidth : 0
  const windowHeight = hasWindow ? window.innerHeight : 0

  const isRadarInRow = shouldPresentRadarInWeatherRow({
    hasRadarCard: Boolean(radarSlot),
    windowWidth,
    windowHeight,
    extraHeight: placementExtraHeight,
  })

  // Without a real viewport (SSR / non-browser rendering) there's no height to clip against,
  // so keep the default full layout rather than hiding content based on a windowHeight of 0.
  // The clock shrinks before the stacked radar is dropped.
  const stackedRadarFit = {
    hasRadarCard: Boolean(radarSlot),
    isRadarInRow,
    windowWidth,
    windowHeight,
    extraHeight,
  }
  const hideStackedRadar = hasWindow && shouldHideStackedRadarCard({ ...stackedRadarFit, canCompactClock: true })
  const effectiveRadarSlot = hideStackedRadar ? undefined : radarSlot
  const isRadarStacked = Boolean(effectiveRadarSlot) && !isRadarInRow

  const useCompactClock = hasWindow && (
    shouldUseCompactClock({ windowWidth, windowHeight, extraHeight }) ||
    shouldCompactClockForStackedRadar(stackedRadarFit)
  )
  const rowWidthClass = isRadarInRow ? 'max-w-[1560px]' : 'max-w-4xl lg:max-w-5xl'

  const cardOpacity = Math.max(0.2, Math.min(1.0, (cardDim ?? 70) / 100))
  const tomorrowDate = addDays(currentTime, 1)

  const timeString = format(currentTime, clock24h ? 'HH:mm' : 'h:mm a')
  const dateString = format(currentTime, 'EEEE, d MMMM')
  const tomorrowDateString = format(tomorrowDate, 'EEEE, d MMMM')

  const tomorrowEveningDaypart = tomorrowForecast?.dayparts.find((dp) => dp.label === 'Evening')
  const isTomorrowEveningSkyFavorable = tomorrowEveningDaypart
    ? isSkyFavorableForAurora(tomorrowEveningDaypart.point)
    : false

  const hasTomorrowAurora = Boolean(
    auroraStatus?.tomorrow?.hasAurora && isTomorrowEveningSkyFavorable
  )

  return (
    <div className={`family-ambient ${className ?? ''}`} data-ambient-view="persistent" data-theme={theme}>
      <div
        className="w-full h-full min-h-screen flex flex-col items-center justify-between p-6 md:p-10 transition-opacity duration-300"
        style={{ opacity: isDimmed ? cardOpacity : 1 }}
      >
        {/* Top Area: Clock & Date centered between top of viewport and top of cards */}
        <div className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center text-center py-4">
          <div className={`${
            useCompactClock
              ? 'text-4xl sm:text-5xl md:text-6xl lg:text-7xl'
              : 'text-6xl sm:text-7xl md:text-8xl lg:text-9xl'
          } font-semibold tracking-tight text-white tabular-nums leading-none transition-all duration-300`}>
            {timeString}
          </div>
          <div className={`flex items-center justify-center flex-wrap gap-x-3.5 gap-y-1 text-xs md:text-sm font-normal tracking-wide mt-2.5 md:mt-3.5 transition-colors duration-300 ${
            isDimmed ? 'text-white/40' : 'text-slate-400'
          }`}>
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={14} className="shrink-0" aria-hidden="true" />
              <span>{dateString}</span>
            </span>
            {displayLocation && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} className="shrink-0" aria-hidden="true" />
                <span>{displayLocation}</span>
              </span>
            )}
          </div>
        </div>

        {/* Main Weather Cards (Rest of Today & Tomorrow, plus optional Radar Card in-row on wide & short screens) */}
        <div className={`w-full ${isRadarStacked ? '' : 'my-auto'} py-4 md:py-6 shrink-0 transition-all duration-500 ${
          isRadarInRow
            ? 'max-w-[1560px] grid grid-cols-3 gap-5 md:gap-6 items-stretch'
            : 'max-w-4xl lg:max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6'
        }`}>
          {/* Card 1: Rest of Today */}
        <div className={`rounded-2xl bg-slate-900/70 p-5 md:p-6 shadow-2xl backdrop-blur-md flex flex-col justify-between space-y-4 transition-all duration-700 ${
          auroraStatus?.isCurrentlyVisible
            ? 'border-2 border-emerald-400/60 aurora-card-border'
            : 'border border-white/10'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-indigo-300">
                  <span>●</span>
                  <span>{curHour >= 18 ? 'Tonight' : 'Rest of Today'}</span>
                </span>
                {auroraStatus?.isCurrentlyVisible && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-normal normal-case px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-400/40 aurora-text-shimmer shadow-xs">
                    <span>✨</span>
                    <span>{auroraStatus.summary || 'Aurora'}</span>
                  </span>
                )}
              </div>
              <span className="text-slate-500 font-normal">{dateString}</span>
            </div>

            {todayForecast ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-4xl md:text-5xl font-light text-white tracking-tight tabular-nums">
                      {todayForecast.currentTemp !== null ? `${Math.round(todayForecast.currentTemp)}°` : '—'}
                    </div>
                    {/* Proximity rain alert (nowcasting) takes the condition line so the card keeps its height */}
                    {rainAlert ? (
                      <div
                        className="text-sm font-medium text-amber-300 mt-1 flex items-center gap-1.5 min-w-0"
                        title={rainAlert.summary}
                      >
                        <span className="shrink-0" aria-hidden="true">🌧️</span>
                        <span className="truncate">{rainAlert.summary}</span>
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-slate-300 mt-1">
                        {getWeatherSymbolLabel(todayForecast.dominantSymbol)}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                    {renderWeatherIcon(todayForecast.dominantSymbol, 44)}
                  </div>
                </div>

                {/* Key stats row */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/10 text-xs text-center">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Low / High</span>
                    <span className="font-semibold text-slate-200 tabular-nums">
                      {todayForecast.minTemp !== null ? `${todayForecast.minTemp}°` : '—'} / {todayForecast.maxTemp !== null ? `${todayForecast.maxTemp}°` : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center justify-center gap-1">
                      <Droplets size={10} className="text-sky-400" />
                      <span>Rain</span>
                    </span>
                    <span className="font-semibold text-slate-200 tabular-nums">
                      {todayForecast.maxPrecipProbability > 0 ? `${todayForecast.maxPrecipProbability}%` : '0%'}
                      {todayForecast.totalPrecipMm > 0 && ` (${todayForecast.totalPrecipMm} mm)`}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center justify-center gap-1">
                      <Wind size={10} className="text-slate-400" />
                      <span>Wind</span>
                    </span>
                    <span className="font-semibold text-slate-200 tabular-nums flex items-center justify-center gap-1">
                      {todayForecast.maxWindSpeed} m/s
                      {todayForecast.isStormWarning && (
                        <AlertTriangle size={12} className="text-rose-400 inline" />
                      )}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                {forecastState === 'unavailable' ? 'Weather forecast unavailable.' : 'Weather forecast loading...'}
              </div>
            )}
          </div>

          {/* Rain Timeline for Today / Tonight (shown when either card has rain) */}
          {showRainTimeline && todayForecast && (
            <div className="pt-3 border-t border-white/5 space-y-1.5">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1 shrink-0">
                  <Droplets size={10} className="text-sky-400" />
                  <span>Rain Timeline</span>
                </span>
                <span className="text-[11px] font-medium text-sky-300/90 text-right">
                  {todayForecast.rainSummary}
                </span>
              </div>

              {/* 24-Hour Bar Chart for Today */}
              <div className="pt-1">
                <div className="h-11 flex items-end gap-[2px] w-full px-1 bg-black/25 rounded-lg p-1 border border-white/5">
                  {todayForecast.rainPoints.map((rp, idx) => {
                    const isCurrent = rp.hour === curHour
                    const isPeak =
                      rp.timeStr === todayForecast.peakRainHour && rp.precipitationMm > 0
                    const maxScale = Math.max(1.5, todayForecast.peakRainMm)
                    const heightPercent =
                      rp.precipitationMm > 0
                        ? Math.max(22, Math.min(100, Math.round((rp.precipitationMm / maxScale) * 100)))
                        : 6

                    let barColor = 'bg-white/5'
                    if (rp.precipitationMm >= 2.0) {
                      barColor = 'bg-indigo-400'
                    } else if (rp.precipitationMm >= 0.8) {
                      barColor = 'bg-sky-400'
                    } else if (rp.precipitationMm >= 0.1) {
                      barColor = 'bg-sky-400/60'
                    }

                    return (
                      <div
                        key={idx}
                        className={`flex-1 flex flex-col items-center justify-end h-full relative group rounded-xs transition-colors ${
                          isCurrent ? 'bg-sky-400/15 ring-1 ring-inset ring-sky-300/50' : ''
                        }`}
                        title={`${rp.timeStr}: ${rp.precipitationMm} mm (${rp.precipitationProbability}%)`}
                      >
                        {(isPeak || isCurrent) && rp.precipitationMm > 0 && (
                          <span className={`absolute -top-3.5 text-[8px] font-mono font-bold px-1 rounded whitespace-nowrap z-10 pointer-events-none shadow-sm ${
                            isCurrent
                              ? 'text-white bg-sky-900/90 border border-white/80'
                              : 'text-sky-200 bg-slate-900/90 border border-sky-400/30'
                          }`}>
                            {rp.precipitationMm}mm
                          </span>
                        )}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-[70%] rounded-xs transition-all ${barColor} ${
                            isPeak ? 'ring-1 ring-sky-300/70' : ''
                          }`}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* Time Axis */}
                <div className="flex justify-between text-[9px] font-mono text-slate-500 px-1 mt-1">
                  <span>{clock24h ? '00:00' : '12am'}</span>
                  <span>{clock24h ? '06:00' : '6am'}</span>
                  <span>{clock24h ? '12:00' : '12pm'}</span>
                  <span>{clock24h ? '18:00' : '6pm'}</span>
                  <span>{clock24h ? '23:00' : '11pm'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Hourly preview pills (stretched to fill full width) */}
          {todayForecast && todayForecast.hourlyPreview.length > 0 && (
            <div className="pt-3 border-t border-white/5">
              <div className="flex gap-2 text-center w-full">
                {todayForecast.hourlyPreview.slice(0, 4).map((pt, idx) => {
                  const d = new Date(pt.time)
                  const timeLabel = format(d, clock24h ? 'HH:mm' : 'ha')
                  const isAuroraHour = Boolean(
                    auroraStatus?.isCurrentlyVisible &&
                    auroraStatus?.activeHourTimestamps?.some((t: string | Date | number) => {
                      const auroraTime = new Date(t)
                      return (
                        auroraTime.getHours() === d.getHours() ||
                        Math.abs(auroraTime.getTime() - d.getTime()) <= 45 * 60 * 1000
                      )
                    })
                  )
                  return (
                    <div
                      key={idx}
                      className={`flex-1 min-w-0 p-1.5 rounded-lg flex flex-col items-center justify-between transition-all duration-500 ${
                        isAuroraHour
                          ? 'border border-emerald-400/70 bg-gradient-to-b from-emerald-950/40 to-teal-950/20 aurora-pill-glow shadow-sm'
                          : 'bg-white/5 border border-white/5'
                      }`}
                      title={isAuroraHour ? 'Aurora Borealis visibility possible' : undefined}
                    >
                      <span className="text-[10px] font-mono flex items-center justify-center gap-0.5 text-slate-400">
                        {timeLabel}
                        {isAuroraHour && <span className="text-[9px] text-emerald-300">✨</span>}
                      </span>
                      <div className="my-1">{renderWeatherIcon(pt.symbol, 18)}</div>
                      <span className="text-xs font-semibold text-slate-200 tabular-nums">
                        {Math.round(pt.temperature)}°
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Tomorrow */}
        <div className={`rounded-2xl bg-slate-900/70 p-5 md:p-6 shadow-2xl backdrop-blur-md flex flex-col justify-between space-y-4 transition-all duration-700 ${
          hasTomorrowAurora
            ? 'border-2 border-emerald-400/60 aurora-card-border'
            : 'border border-white/10'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-amber-300">
                  <span>●</span>
                  <span>Tomorrow</span>
                </span>
                {hasTomorrowAurora && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-normal normal-case px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-400/40 aurora-text-shimmer shadow-xs">
                    <span>✨</span>
                    <span>{auroraStatus?.tomorrow?.summary || 'Aurora'}</span>
                  </span>
                )}
              </div>
              <span className="text-slate-500 font-normal">{tomorrowDateString}</span>
            </div>

            {tomorrowForecast ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-4xl md:text-5xl font-light text-white tracking-tight tabular-nums">
                      {tomorrowForecast.maxTemp !== null ? `${Math.round(tomorrowForecast.maxTemp)}°` : '—'}
                    </div>
                    <div className="text-sm font-medium text-slate-300 mt-1">
                      {getWeatherSymbolLabel(tomorrowForecast.dominantSymbol)}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                    {renderWeatherIcon(tomorrowForecast.dominantSymbol, 44)}
                  </div>
                </div>

                {/* Key stats row */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/10 text-xs text-center">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 block">Low / High</span>
                    <span className="font-semibold text-slate-200 tabular-nums">
                      {tomorrowForecast.minTemp !== null ? `${tomorrowForecast.minTemp}°` : '—'} / {tomorrowForecast.maxTemp !== null ? `${tomorrowForecast.maxTemp}°` : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center justify-center gap-1">
                      <Droplets size={10} className="text-sky-400" />
                      <span>Rain</span>
                    </span>
                    <span className="font-semibold text-slate-200 tabular-nums">
                      {tomorrowForecast.maxPrecipProbability > 0 ? `${tomorrowForecast.maxPrecipProbability}%` : '0%'}
                      {tomorrowForecast.totalPrecipMm > 0 && ` (${tomorrowForecast.totalPrecipMm} mm)`}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center justify-center gap-1">
                      <Wind size={10} className="text-slate-400" />
                      <span>Wind</span>
                    </span>
                    <span className="font-semibold text-slate-200 tabular-nums flex items-center justify-center gap-1">
                      {tomorrowForecast.maxWindSpeed} m/s
                      {tomorrowForecast.isStormWarning && (
                        <AlertTriangle size={12} className="text-rose-400 inline" />
                      )}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                {forecastState === 'unavailable' ? 'Weather forecast unavailable.' : 'Weather forecast loading...'}
              </div>
            )}
          </div>

          {/* Rain Timeline / Precipitation Chart (shown when either card has rain) */}
          {showRainTimeline && tomorrowForecast && (
            <div className="pt-3 border-t border-white/5 space-y-1.5">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1 shrink-0">
                  <Droplets size={10} className="text-sky-400" />
                  <span>Rain Timeline</span>
                </span>
                <span className="text-[11px] font-medium text-sky-300/90 text-right">
                  {tomorrowForecast.rainSummary}
                </span>
              </div>

              {/* 24-Hour Bar Chart */}
              <div className="pt-1">
                <div className="h-11 flex items-end gap-[2px] w-full px-1 bg-black/25 rounded-lg p-1 border border-white/5">
                  {tomorrowForecast.rainPoints.map((rp, idx) => {
                    const isPeak =
                      rp.timeStr === tomorrowForecast.peakRainHour && rp.precipitationMm > 0
                    const maxScale = Math.max(1.5, tomorrowForecast.peakRainMm)
                    const heightPercent =
                      rp.precipitationMm > 0
                        ? Math.max(22, Math.min(100, Math.round((rp.precipitationMm / maxScale) * 100)))
                        : 6

                    let barColor = 'bg-white/5'
                    if (rp.precipitationMm >= 2.0) {
                      barColor = 'bg-indigo-400'
                    } else if (rp.precipitationMm >= 0.8) {
                      barColor = 'bg-sky-400'
                    } else if (rp.precipitationMm >= 0.1) {
                      barColor = 'bg-sky-400/60'
                    }

                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center justify-end h-full relative group"
                        title={`${rp.timeStr}: ${rp.precipitationMm} mm (${rp.precipitationProbability}%)`}
                      >
                        {isPeak && (
                          <span className="absolute -top-3.5 text-[8px] font-mono text-sky-200 font-bold bg-slate-900/90 px-1 rounded border border-sky-400/30 whitespace-nowrap z-10 pointer-events-none shadow-sm">
                            {rp.precipitationMm}mm
                          </span>
                        )}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-xs transition-all ${barColor} ${
                            isPeak ? 'ring-1 ring-sky-300/70' : ''
                          }`}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* Time Axis */}
                <div className="flex justify-between text-[9px] font-mono text-slate-500 px-1 mt-1">
                  <span>{clock24h ? '00:00' : '12am'}</span>
                  <span>{clock24h ? '06:00' : '6am'}</span>
                  <span>{clock24h ? '12:00' : '12pm'}</span>
                  <span>{clock24h ? '18:00' : '6pm'}</span>
                  <span>{clock24h ? '23:00' : '11pm'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Dayparts preview (Morning, Afternoon, Evening) (stretched to fill full width) */}
          {tomorrowForecast && tomorrowForecast.dayparts.length > 0 && (
            <div className="pt-3 border-t border-white/5">
              <div className="flex gap-2 text-center w-full">
                {tomorrowForecast.dayparts.map((dp, idx) => {
                  const isAuroraDaypart = Boolean(
                    hasTomorrowAurora &&
                    dp.label === 'Evening' &&
                    isSkyFavorableForAurora(dp.point)
                  )
                  return (
                    <div
                      key={idx}
                      className={`flex-1 min-w-0 p-1.5 rounded-lg flex flex-col items-center justify-between transition-all duration-500 ${
                        isAuroraDaypart
                          ? 'border border-emerald-400/70 bg-gradient-to-b from-emerald-950/40 to-teal-950/20 aurora-pill-glow shadow-sm'
                          : 'bg-white/5 border border-white/5'
                      }`}
                      title={isAuroraDaypart ? 'Aurora Borealis visibility likely tomorrow evening' : undefined}
                    >
                      <span className="text-[10px] font-medium flex items-center justify-center gap-0.5 text-slate-400">
                        {dp.label}
                        {isAuroraDaypart && <span className="text-[9px] text-emerald-300">✨</span>}
                      </span>
                      <div className="my-1">{renderWeatherIcon(dp.point.symbol, 18)}</div>
                      <span className="text-xs font-semibold text-slate-200 tabular-nums">
                        {Math.round(dp.point.temperature)}°
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Card 3: Live Radar Card as the 3rd column on wide & short screens */}
        {isRadarInRow && effectiveRadarSlot}
      </div>

      {onShowWeekChange && (
        <button
          type="button"
          className="ambient-week-toggle shrink-0 -mt-2 md:-mt-3 mb-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium uppercase tracking-wider cursor-pointer"
          aria-expanded={showWeek}
          aria-controls="ambient-week-outlook"
          onClick={() => onShowWeekChange(!showWeek)}
        >
          <CalendarDays size={12} aria-hidden="true" />
          <span>{showWeek ? 'Hide week' : 'Week ahead'}</span>
          <ChevronDown size={12} aria-hidden="true" className="ambient-week-chevron" />
        </button>
      )}

      {/* Week outlook: the rest of the week as compact day cards, revealed with a staggered rise */}
      <div
        id="ambient-week-outlook"
        className={`ambient-week w-full ${rowWidthClass} shrink-0`}
        data-open={isWeekShown}
        aria-hidden={!isWeekShown}
      >
        <div className="ambient-week-inner">
          <div className="grid grid-cols-5 gap-2 sm:gap-3 md:gap-4 pt-1 pb-4 md:pb-6">
            {weekDays.map((day, index) => (
              <WeekDayCard key={day.date} day={day} index={index} />
            ))}
          </div>
        </div>
      </div>

      {/* Stacked radar card: grows into the height left under the weather cards (the clock only
          gets what the capped card leaves over); hidden when even the minimum would clip */}
      {isRadarStacked && (
        <div className="w-full max-w-4xl lg:max-w-5xl flex-[999_1_0%] min-h-[300px] max-h-[640px] grid grid-rows-[minmax(0,1fr)]">
          {effectiveRadarSlot}
        </div>
      )}

      </div>
    </div>
  )
}

/** A compact day of the week outlook: weekday, condition, high and low, and rain or storm when there is any. */
function WeekDayCard({ day, index }: { day: DailyOutlook; index: number }) {
  const date = new Date(`${day.date}T12:00:00`)
  const label = getWeatherSymbolLabel(day.dominantSymbol)
  const style = { '--ambient-week-index': index } as CSSProperties

  return (
    <div
      className="ambient-week-card min-w-0 rounded-xl bg-slate-900/50 border border-white/5 px-2 py-3 md:px-3 flex flex-col items-center text-center"
      style={style}
      title={`${format(date, 'EEEE d MMMM')}: ${label}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{format(date, 'EEE')}</span>
      <span className="hidden sm:block text-[10px] text-slate-500 tabular-nums">{format(date, 'd MMM')}</span>
      <div className="my-2" aria-label={label}>{renderWeatherIcon(day.dominantSymbol, 30)}</div>
      <div className="text-sm tabular-nums whitespace-nowrap">
        <span className="font-semibold text-slate-200">{day.maxTemp !== null ? `${Math.round(day.maxTemp)}°` : '—'}</span>
        <span className="text-slate-500"> {day.minTemp !== null ? `${Math.round(day.minTemp)}°` : '—'}</span>
      </div>
      <div className="mt-1 h-3.5 text-[10px] tabular-nums whitespace-nowrap flex items-center justify-center gap-1">
        {day.isStormWarning ? (
          <span className="inline-flex items-center gap-1 text-rose-300/90">
            <AlertTriangle size={10} aria-hidden="true" />
            <span>{Math.round(day.maxWindSpeed)} m/s</span>
          </span>
        ) : day.totalPrecipMm >= 0.1 ? (
          <span className="inline-flex items-center gap-1 text-sky-300/90">
            <Droplets size={10} aria-hidden="true" />
            <span>{day.totalPrecipMm} mm</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
