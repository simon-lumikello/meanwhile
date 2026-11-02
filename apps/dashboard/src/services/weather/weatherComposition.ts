import { isSameDay } from 'date-fns'
import { getShortRainAlertLabel, type RainProximityAlert } from '@simon-lumikello/meanwhile-radar/core'
import { fetchFmiRadarRainRate } from '@simon-lumikello/meanwhile-radar/sources'
import type { HourlyWeatherPoint, WeatherSymbol } from '@simon-lumikello/meanwhile-weather/core'
import type { WeatherProvider, WeatherProviderConfig } from '@simon-lumikello/meanwhile-weather/providers'

/** Radar rates below this are trace echoes: too weak to change the rain timeline or to report as falling rain. */
export const MIN_REPORTED_RADAR_RATE_MM_H = 0.1

type RadarRainRateFetcher = (latitude: number, longitude: number) => Promise<number | null>

interface WeatherCompositionOptions {
  currentTime?: Date
  fetchRadarRainRate?: RadarRainRateFetcher
  signal?: AbortSignal
}

function getPrecipitationSymbol(rate: number, temperature: number): WeatherSymbol {
  if (temperature <= 0) return rate >= 1.5 ? 'snow-heavy' : 'snow-light'
  if (temperature <= 1.5) return 'sleet'
  if (rate >= 3) return 'rain-heavy'
  if (rate >= 0.8) return 'rain-moderate'
  return 'rain-light'
}

export function blendRadarIntoTimeline(
  points: HourlyWeatherPoint[],
  radarRate: number,
  targetDate: Date,
  currentTime = new Date(),
): HourlyWeatherPoint[] {
  if (points.length === 0 || radarRate < 0.01 || !isSameDay(targetDate, currentTime)) {
    return points
  }

  const currentHour = currentTime.getHours()
  const cutoffPastMs = currentTime.getTime() - 45 * 60 * 1000

  return points.map((point) => {
    const pointDate = new Date(point.time)
    if (pointDate.getTime() < cutoffPastMs) return point

    const pointHour = pointDate.getHours()
    const isCurrentHour = pointHour === currentHour
    const isNextHour = currentHour < 23 && pointHour === currentHour + 1
    if (!isCurrentHour && !isNextHour) return point

    const effectiveRate = isCurrentHour ? radarRate : Math.round(radarRate * 0.6 * 10) / 10
    if (effectiveRate <= point.precipitationMm) return point

    return {
      ...point,
      precipitationMm: Math.round(effectiveRate * 10) / 10,
      precipitationProbability: Math.max(point.precipitationProbability ?? 0, isCurrentHour ? 95 : 80),
      symbol: getPrecipitationSymbol(effectiveRate, point.temperature),
    }
  })
}

/**
 * Adds dashboard-only FMI radar nowcasting to a provider forecast without making
 * either reusable package depend on the other.
 */
export async function fetchDashboardWeatherForecast(
  provider: WeatherProvider,
  date: Date,
  config: WeatherProviderConfig,
  options: WeatherCompositionOptions = {},
): Promise<HourlyWeatherPoint[]> {
  const currentTime = options.currentTime ?? new Date()
  const shouldEnrichWithRadar = provider.id === 'fmi' && isSameDay(date, currentTime)
  const forecastPromise = provider.fetchForecast({ date, config, now: currentTime, signal: options.signal })

  const radarRatePromise = shouldEnrichWithRadar
    ? (options.fetchRadarRainRate ?? fetchFmiRadarRainRate)(
        config.latitude ?? 60.1695,
        config.longitude ?? 24.9354,
      ).catch(() => null)
    : Promise.resolve(null)

  const [forecastPoints, radarRate] = await Promise.all([forecastPromise, radarRatePromise])
  if (radarRate === null || radarRate < MIN_REPORTED_RADAR_RATE_MM_H) return forecastPoints

  return blendRadarIntoTimeline(forecastPoints, radarRate, date, currentTime)
}

/**
 * Keeps a "falling now" alert in step with the rain timeline shown beside it:
 * trace radar echoes are dropped, and the reported rate is never lower than the
 * current hour's timeline amount.
 */
export function reconcileRainAlertWithTimeline(
  alert: RainProximityAlert | null,
  todayPoints: HourlyWeatherPoint[],
  currentTime = new Date(),
): RainProximityAlert | null {
  if (!alert || alert.status !== 'active') return alert
  if (alert.intensityMmH < MIN_REPORTED_RADAR_RATE_MM_H) return null

  const currentHourPoint = todayPoints.find((point) => {
    const pointDate = new Date(point.time)
    return isSameDay(pointDate, currentTime) && pointDate.getHours() === currentTime.getHours()
  })
  const rate = Math.round(Math.max(alert.intensityMmH, currentHourPoint?.precipitationMm ?? 0) * 10) / 10
  if (rate === alert.intensityMmH) return alert

  const reconciled = { ...alert, intensityMmH: rate }
  return { ...reconciled, summary: `${getShortRainAlertLabel(reconciled)} falling now · ${rate.toFixed(1)} mm/h` }
}
