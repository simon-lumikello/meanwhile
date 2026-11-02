import type { HourlyWeatherPoint } from './weather'
import { getSolarTimes } from './solar'

export interface DaylightWindow {
  hasDaylight: boolean
  isPolarDay: boolean
  isPolarNight: boolean
  startPercent: number // 0-100 percentage of the 24-hour day
  endPercent: number // 0-100 percentage of the 24-hour day
  sunriseDate?: Date
  sunsetDate?: Date
  sunriseLabel: string // formatted e.g. "06:40" or "6:40 AM"
  sunsetLabel: string // formatted e.g. "19:51" or "7:51 PM"
}

export interface DaylightOptions {
  clock24h?: boolean
  targetDate?: Date
  lat?: number
  lon?: number
}

export function formatTimeLabel(date: Date, clock24h = true): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const paddedMin = String(minutes).padStart(2, '0')

  if (clock24h) {
    return `${String(hours).padStart(2, '0')}:${paddedMin}`
  }

  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHours}:${paddedMin} ${period}`
}

/**
 * Calculates the daylight window (sunrise to sunset percentage and labels)
 * based on weather provider data (sunrise/sunset timestamps or isDay points).
 */
export function calculateDaylightWindow(
  weatherPoints: HourlyWeatherPoint[],
  options: DaylightOptions = {},
): DaylightWindow | null {
  const { clock24h = true, targetDate = new Date(), lat, lon } = options

  if (!weatherPoints || weatherPoints.length === 0) {
    if (lat !== undefined && lon !== undefined) {
      const { sunrise, sunset } = getSolarTimes(targetDate, lat, lon)
      return createWindowFromDates(sunrise, sunset, clock24h)
    }
    return null
  }

  // 1. Priority: Check if any weather point contains explicit sunrise and sunset timestamps from provider
  const pointWithSolar = weatherPoints.find((p) => p.sunrise && p.sunset)
  if (pointWithSolar?.sunrise && pointWithSolar?.sunset) {
    const sunriseDate = new Date(pointWithSolar.sunrise)
    const sunsetDate = new Date(pointWithSolar.sunset)
    if (!isNaN(sunriseDate.getTime()) && !isNaN(sunsetDate.getTime())) {
      return createWindowFromDates(sunriseDate, sunsetDate, clock24h)
    }
  }

  // 2. Check isDay status across points
  const pointsWithDayFlag = weatherPoints.filter((p) => p.isDay !== undefined)
  if (pointsWithDayFlag.length > 0) {
    const dayPoints = pointsWithDayFlag.filter((p) => p.isDay === true)

    // Polar night (sun never rises)
    if (dayPoints.length === 0) {
      return {
        hasDaylight: false,
        isPolarDay: false,
        isPolarNight: true,
        startPercent: 0,
        endPercent: 0,
        sunriseLabel: '',
        sunsetLabel: '',
      }
    }

    // Midnight sun (sun never sets throughout the 24h cycle)
    if (dayPoints.length === pointsWithDayFlag.length && pointsWithDayFlag.length >= 18) {
      return {
        hasDaylight: true,
        isPolarDay: true,
        isPolarNight: false,
        startPercent: 0,
        endPercent: 100,
        sunriseLabel: 'Midnight Sun',
        sunsetLabel: 'No Sunset',
      }
    }

    // Identify transition points from night -> day and day -> night
    const sorted = [...pointsWithDayFlag].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    )

    let sunriseMinutes: number | null = null
    let sunsetMinutes: number | null = null

    for (let i = 0; i < sorted.length; i++) {
      const pt = sorted[i]
      const prev = sorted[i - 1]

      const ptDate = new Date(pt.time)
      const ptMinutes = ptDate.getHours() * 60 + ptDate.getMinutes()

      if (pt.isDay && (!prev || !prev.isDay)) {
        if (sunriseMinutes === null) {
          if (prev) {
            const prevDate = new Date(prev.time)
            const prevMinutes = prevDate.getHours() * 60 + prevDate.getMinutes()
            sunriseMinutes = Math.round((prevMinutes + ptMinutes) / 2)
          } else {
            sunriseMinutes = ptMinutes
          }
        }
      }

      if (!pt.isDay && prev && prev.isDay) {
        if (sunsetMinutes === null) {
          const prevDate = new Date(prev.time)
          const prevMinutes = prevDate.getHours() * 60 + prevDate.getMinutes()
          sunsetMinutes = Math.round((prevMinutes + ptMinutes) / 2)
        }
      }

      if (i === sorted.length - 1 && pt.isDay && sunsetMinutes === null) {
        sunsetMinutes = Math.min(1440, ptMinutes + 30)
      }
    }

    if (sunriseMinutes !== null && sunsetMinutes !== null) {
      const startPercent = Math.max(0, Math.min(100, (sunriseMinutes / 1440) * 100))
      const endPercent = Math.max(0, Math.min(100, (sunsetMinutes / 1440) * 100))

      const sunriseDate = new Date(targetDate)
      sunriseDate.setHours(Math.floor(sunriseMinutes / 60), sunriseMinutes % 60, 0, 0)

      const sunsetDate = new Date(targetDate)
      sunsetDate.setHours(Math.floor(sunsetMinutes / 60), sunsetMinutes % 60, 0, 0)

      return {
        hasDaylight: true,
        isPolarDay: false,
        isPolarNight: false,
        startPercent,
        endPercent,
        sunriseDate,
        sunsetDate,
        sunriseLabel: formatTimeLabel(sunriseDate, clock24h),
        sunsetLabel: formatTimeLabel(sunsetDate, clock24h),
      }
    }
  }

  // 3. Fallback: If lat & lon provided, use solar positioning calculation
  if (lat !== undefined && lon !== undefined) {
    const { sunrise, sunset } = getSolarTimes(targetDate, lat, lon)
    return createWindowFromDates(sunrise, sunset, clock24h)
  }

  return null
}

function createWindowFromDates(sunrise: Date, sunset: Date, clock24h: boolean): DaylightWindow {
  const sunriseMinutes = sunrise.getHours() * 60 + sunrise.getMinutes()
  const sunsetMinutes = sunset.getHours() * 60 + sunset.getMinutes()

  const startPercent = Math.max(0, Math.min(100, (sunriseMinutes / 1440) * 100))
  const endPercent = Math.max(0, Math.min(100, (sunsetMinutes / 1440) * 100))

  return {
    hasDaylight: true,
    isPolarDay: false,
    isPolarNight: false,
    startPercent,
    endPercent,
    sunriseDate: sunrise,
    sunsetDate: sunset,
    sunriseLabel: formatTimeLabel(sunrise, clock24h),
    sunsetLabel: formatTimeLabel(sunset, clock24h),
  }
}
