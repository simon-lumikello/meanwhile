import type { AuroraDayVisibilityStatus, AuroraKpPoint, AuroraVisibilityStatus } from './aurora'
import type { HourlyWeatherPoint } from './weather'
import { getSolarTimes, isDaylight } from './solar'

export function getKpThresholdForLatitude(lat: number): number {
  const absLat = Math.abs(lat)
  if (absLat >= 66) return 2.5
  if (absLat >= 63) return 3.5
  if (absLat >= 60) return 4.5
  if (absLat >= 56) return 5.0
  if (absLat >= 52) return 6.0
  return Math.min(9.0, Math.round((6.5 + (52 - absLat) * 0.25) * 10) / 10)
}

function parseAuroraTimestamp(time: string): Date {
  return new Date(time.endsWith('Z') ? time : `${time}Z`)
}

export function findKpForTimestamp(kpPoints: AuroraKpPoint[], targetTime: Date): number | null {
  if (kpPoints.length === 0) return null

  const targetMs = targetTime.getTime()
  let closest: AuroraKpPoint | null = null
  let minDiff = Infinity
  for (const point of kpPoints) {
    const diff = Math.abs(parseAuroraTimestamp(point.time).getTime() - targetMs)
    if (diff < minDiff) {
      closest = point
      minDiff = diff
    }
  }
  return closest && minDiff <= 4 * 60 * 60 * 1000 ? closest.kp : null
}

export function isSkyFavorableForAurora(point: HourlyWeatherPoint): boolean {
  if (point.precipitationMm && point.precipitationMm > 0.05) return false
  return ['clear-night', 'partly-cloudy-night', 'clear-day', 'partly-cloudy-day'].includes(point.symbol)
}

export function evaluateAuroraVisibility(
  kpPoints: AuroraKpPoint[],
  hourlyWeather: HourlyWeatherPoint[],
  lat: number,
  lon: number,
  currentTime: Date,
  tomorrowWeather: HourlyWeatherPoint[] = [],
): AuroraVisibilityStatus {
  const thresholdKp = getKpThresholdForLatitude(lat)
  if (kpPoints.length === 0 || hourlyWeather.length === 0) {
    return {
      hasAuroraTonight: false, isCurrentlyVisible: false, isAuroraOngoing: false, currentKp: 0,
      peakKp: 0, thresholdKp, activeHourTimestamps: [], summary: '',
    }
  }

  const currentMs = currentTime.getTime()
  const candidatePoints = hourlyWeather.filter((point) => new Date(point.time).getTime() >= currentMs - 30 * 60 * 1000)
  const activeHourTimestamps: string[] = []
  let peakKp = 0
  for (const point of candidatePoints) {
    const pointDate = new Date(point.time)
    if (isDaylight(pointDate, lat, lon)) continue
    const kp = findKpForTimestamp(kpPoints, pointDate) ?? 0
    peakKp = Math.max(peakKp, kp)
    if (kp >= thresholdKp && isSkyFavorableForAurora(point)) activeHourTimestamps.push(point.time)
  }

  const currentKp = findKpForTimestamp(kpPoints, currentTime) ?? 0
  const isAuroraOngoing = !isDaylight(currentTime, lat, lon) && currentKp >= thresholdKp
  // Require nearby provider data; an expired or distant forecast cannot confirm a clear sky now.
  const currentWeather = hourlyWeather.reduce<HourlyWeatherPoint | undefined>((closest, point) => {
    const distance = Math.abs(new Date(point.time).getTime() - currentMs)
    if (distance > 60 * 60 * 1000 || !Number.isFinite(distance)) return closest
    return !closest || distance < Math.abs(new Date(closest.time).getTime() - currentMs) ? point : closest
  }, undefined)
  const isCurrentlyVisible = isAuroraOngoing && Boolean(currentWeather && isSkyFavorableForAurora(currentWeather))
  const hasAuroraTonight = activeHourTimestamps.length > 0 || isCurrentlyVisible
  const displayKp = peakKp > 0 ? peakKp : currentKp
  const summary = hasAuroraTonight
    ? isCurrentlyVisible ? `Aurora Visible Now · Kp ${displayKp.toFixed(1)}` : `Aurora · Kp ${displayKp.toFixed(1)}`
    : ''

  let tomorrow: AuroraDayVisibilityStatus | undefined
  if (tomorrowWeather.length > 0) {
    const tomorrowDate = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000)
    const { sunset } = getSolarTimes(tomorrowDate, lat, lon)
    const eveningPoints = tomorrowWeather.filter((point) => {
      const pointDate = new Date(point.time)
      return pointDate.getTime() >= sunset.getTime() - 60 * 60 * 1000 && !isDaylight(pointDate, lat, lon)
    })
    const activeHours: string[] = []
    let tomorrowPeakKp = 0
    for (const point of eveningPoints) {
      const kp = findKpForTimestamp(kpPoints, new Date(point.time)) ?? 0
      tomorrowPeakKp = Math.max(tomorrowPeakKp, kp)
      if (kp >= thresholdKp && isSkyFavorableForAurora(point)) activeHours.push(point.time)
    }
    const hasEveningRain = eveningPoints.reduce((sum, point) => sum + (point.precipitationMm || 0), 0) > 0.2
      || eveningPoints.some((point) => ['rain-heavy', 'rain-moderate', 'snow-heavy', 'thunder', 'sleet'].includes(point.symbol))
    if (activeHours.length > 0 && !hasEveningRain) {
      tomorrow = { hasAurora: true, peakKp: tomorrowPeakKp, activeHourTimestamps: activeHours, summary: `Aurora · Kp ${tomorrowPeakKp.toFixed(1)}` }
    }
  }

  return { hasAuroraTonight, isCurrentlyVisible, isAuroraOngoing, currentKp, peakKp: displayKp, thresholdKp, activeHourTimestamps, summary, tomorrow }
}
