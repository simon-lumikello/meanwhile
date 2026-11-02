import type { HourlyWeatherPoint, WeatherSymbol } from './weather'
import { isDaylight } from './solar'

export function normalizeNightSymbol(symbol: WeatherSymbol, isNight: boolean): WeatherSymbol {
  if (!isNight) return symbol
  if (symbol === 'clear-day') return 'clear-night'
  if (symbol === 'partly-cloudy-day') return 'partly-cloudy-night'
  return symbol
}

export interface RestOfTodayForecast {
  currentTemp: number | null
  currentSymbol: WeatherSymbol
  minTemp: number | null
  maxTemp: number | null
  dominantSymbol: WeatherSymbol
  maxPrecipProbability: number
  totalPrecipMm: number
  maxWindSpeed: number
  isStormWarning: boolean
  hourlyPreview: HourlyWeatherPoint[]
  rainPoints: HourlyRainPoint[]
  rainSummary: string
  peakRainMm: number
  peakRainHour: string | null
  hasRain: boolean
}

export interface DaypartPoint {
  label: 'Morning' | 'Afternoon' | 'Evening'
  timeStr: string
  point: HourlyWeatherPoint
}

export interface HourlyRainPoint {
  timeStr: string
  hour: number
  precipitationMm: number
  precipitationProbability: number
  temp: number
  symbol: WeatherSymbol
}

export interface TomorrowForecast {
  minTemp: number | null
  maxTemp: number | null
  dominantSymbol: WeatherSymbol
  maxPrecipProbability: number
  totalPrecipMm: number
  maxWindSpeed: number
  isStormWarning: boolean
  dayparts: DaypartPoint[]
  rainPoints: HourlyRainPoint[]
  rainSummary: string
  peakRainMm: number
  peakRainHour: string | null
  hasRain: boolean
}

const SYMBOL_SEVERITY: Record<WeatherSymbol, number> = {
  thunder: 10,
  'snow-heavy': 9,
  'rain-heavy': 8,
  sleet: 7,
  'rain-moderate': 6,
  'snow-light': 5,
  'rain-light': 4,
  fog: 3,
  cloudy: 2,
  'partly-cloudy-day': 1,
  'partly-cloudy-night': 1,
  'clear-day': 0,
  'clear-night': 0,
}

export function getWeatherSymbolLabel(symbol: WeatherSymbol): string {
  switch (symbol) {
    case 'clear-day':
      return 'Sunny & Clear'
    case 'clear-night':
      return 'Clear Sky'
    case 'partly-cloudy-day':
      return 'Partly Cloudy'
    case 'partly-cloudy-night':
      return 'Partly Cloudy'
    case 'cloudy':
      return 'Overcast'
    case 'fog':
      return 'Foggy'
    case 'rain-light':
      return 'Light Rain'
    case 'rain-moderate':
      return 'Showers / Rain'
    case 'rain-heavy':
      return 'Heavy Rain'
    case 'sleet':
      return 'Sleet'
    case 'snow-light':
      return 'Light Snow'
    case 'snow-heavy':
      return 'Heavy Snow'
    case 'thunder':
      return 'Thunderstorms'
    default:
      return 'Fair'
  }
}

export function getDominantSymbol(points: HourlyWeatherPoint[]): WeatherSymbol {
  if (points.length === 0) return 'clear-day'

  // Prioritize active daytime hours (07:00 to 21:00) when the family is awake and outdoors
  const daytimePoints = points
    .filter((p) => {
      const h = new Date(p.time).getHours()
      return h >= 7 && h <= 21
    })
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  // Use daytime points if at least 3 points exist, otherwise fall back to all points
  let candidatePoints = daytimePoints.length >= 3 ? daytimePoints : points

  // A shower confined to a narrow block touching only the very start or very end of the daytime
  // window, with the rest of the day otherwise dry, should not paint the whole day as rainy (a
  // storm through the middle of the day still counts in full). Severe conditions are never excluded.
  if (candidatePoints.length >= 4) {
    const isWet = (p: HourlyWeatherPoint) =>
      (p.precipitationMm || 0) > 0 || (SYMBOL_SEVERITY[p.symbol] ?? 0) >= SYMBOL_SEVERITY['rain-light']
    const isSevere = (p: HourlyWeatherPoint) =>
      p.isStormWarning || (SYMBOL_SEVERITY[p.symbol] ?? 0) >= SYMBOL_SEVERITY['sleet']

    const wetIndices: number[] = []
    candidatePoints.forEach((p, i) => {
      if (isWet(p)) wetIndices.push(i)
    })
    const wetFraction = wetIndices.length / candidatePoints.length

    if (wetIndices.length > 0 && wetFraction < 0.4 && !candidatePoints.some(isSevere)) {
      const first = wetIndices[0]
      const last = wetIndices[wetIndices.length - 1]
      const isContiguousBlock = last - first === wetIndices.length - 1
      const touchesEdge = first === 0 || last === candidatePoints.length - 1
      if (isContiguousBlock && touchesEdge) {
        const dryMajority = candidatePoints.filter((_, i) => !wetIndices.includes(i))
        if (dryMajority.length > 0) {
          candidatePoints = dryMajority
        }
      }
    }
  }

  let maxScore = -1
  let dominant: WeatherSymbol = candidatePoints[0].symbol
  let daytimePrecip = 0

  for (const pt of candidatePoints) {
    const score = SYMBOL_SEVERITY[pt.symbol] ?? 0
    if (score > maxScore) {
      maxScore = score
      dominant = pt.symbol
    }
    daytimePrecip += pt.precipitationMm || 0
  }

  // Active daytime precipitation determines whether daytime candidate points elevate to rain/snow.
  // Overnight precipitation (which ends before waking hours or belongs to the night) is reflected
  // in 24h totals and timelines, but must NEVER repaint the dry daytime card as rainy.
  const significantPrecip = daytimePrecip >= 0.5

  // If daytime candidate points didn't already have a precipitation symbol (e.g. provider reported fog/overcast),
  // elevate to precipitation if there is significant precipitation, respecting winter vs above-freezing temperatures:
  if (maxScore < SYMBOL_SEVERITY['rain-light'] && significantPrecip) {
    const avgTemp = candidatePoints.reduce((sum, p) => sum + p.temperature, 0) / (candidatePoints.length || 1)
    const heavyPrecip = daytimePrecip >= 10.0
    const moderatePrecip = daytimePrecip >= 1.5
    const heavySnow = daytimePrecip >= 6.0
    if (avgTemp <= 0) {
      dominant = heavySnow ? 'snow-heavy' : 'snow-light'
    } else if (avgTemp <= 1.5) {
      dominant = 'sleet'
    } else if (heavyPrecip) {
      dominant = 'rain-heavy'
    } else if (moderatePrecip) {
      dominant = 'rain-moderate'
    } else {
      dominant = 'rain-light'
    }
  }

  // When daytime is dry (no rain/snow/thunder), determine dominant dry condition:
  // An early morning overcast or fog block (e.g. 07:00-09:30) clearing up to sunshine must not
  // paint an otherwise clear/sunny day as Overcast.
  if (maxScore < SYMBOL_SEVERITY['rain-light'] && !significantPrecip) {
    const afternoonPts = candidatePoints.filter((p) => {
      const h = new Date(p.time).getHours()
      return h >= 11 && h <= 17
    })

    const isClear = (s: WeatherSymbol) => s === 'clear-day' || s === 'clear-night'
    const isPartly = (s: WeatherSymbol) => s === 'partly-cloudy-day' || s === 'partly-cloudy-night'

    const clearCount = candidatePoints.filter((p) => isClear(p.symbol)).length
    const partlyCount = candidatePoints.filter((p) => isPartly(p.symbol)).length
    const cloudCount = candidatePoints.filter((p) => p.symbol === 'cloudy').length
    const fogCount = candidatePoints.filter((p) => p.symbol === 'fog').length

    const afternoonClear = afternoonPts.some((p) => isClear(p.symbol))
    const afternoonAllCloudy = afternoonPts.length > 0 && afternoonPts.every((p) => p.symbol === 'cloudy')

    if (fogCount > candidatePoints.length / 2) {
      dominant = 'fog'
    } else if (afternoonAllCloudy && cloudCount >= clearCount + partlyCount) {
      dominant = 'cloudy'
    } else if (clearCount > cloudCount && (afternoonClear || clearCount >= candidatePoints.length / 2)) {
      dominant = 'clear-day'
    } else if (clearCount + partlyCount > cloudCount) {
      dominant = afternoonClear && clearCount >= candidatePoints.length * 0.4 ? 'clear-day' : 'partly-cloudy-day'
    } else if (afternoonClear && clearCount >= 3) {
      dominant = 'partly-cloudy-day'
    } else if (cloudCount > 0) {
      dominant = 'cloudy'
    } else {
      const afternoonPt = afternoonPts[0]
      if (afternoonPt) dominant = afternoonPt.symbol
    }
  }

  return dominant
}

export function calculateRestOfTodayForecast(
  points: HourlyWeatherPoint[],
  currentTime: Date,
): RestOfTodayForecast | null {
  if (points.length === 0) return null

  const currentMs = currentTime.getTime()
  // Include points from 30 minutes before current time onwards
  const remaining = points.filter((p) => new Date(p.time).getTime() >= currentMs - 30 * 60 * 1000)

  const activePoints = remaining.length > 0 ? remaining : [points[points.length - 1]]

  // Nearest point to currentTime
  let closestPoint = points[0]
  let minDiff = Math.abs(new Date(points[0].time).getTime() - currentMs)
  for (const p of points) {
    const diff = Math.abs(new Date(p.time).getTime() - currentMs)
    if (diff < minDiff) {
      minDiff = diff
      closestPoint = p
    }
  }

  const temps = activePoints.map((p) => p.temperature)
  const minTemp = Math.min(...temps)
  const maxTemp = Math.max(...temps)
  const dominantSymbol = getDominantSymbol(activePoints)

  let maxProb = 0
  let totalPrecip = 0
  let maxWind = 0
  let isStorm = false

  for (const p of activePoints) {
    if (p.precipitationProbability && p.precipitationProbability > maxProb) {
      maxProb = p.precipitationProbability
    }
    totalPrecip += p.precipitationMm || 0
    if (p.windSpeedMs && p.windSpeedMs > maxWind) maxWind = p.windSpeedMs
    if (p.windGustMs && p.windGustMs > maxWind) maxWind = p.windGustMs
    if (p.isStormWarning) isStorm = true
  }

  // Pick up to 5 points spaced by ~1 hour for preview
  const hourlyPreview: HourlyWeatherPoint[] = []
  let lastPreviewHour = -1
  for (const p of activePoints) {
    const ptDate = new Date(p.time)
    const h = ptDate.getHours()
    if (h !== lastPreviewHour) {
      const isPointNight = p.isDay !== undefined ? !p.isDay : !isDaylight(ptDate)
      hourlyPreview.push({
        ...p,
        symbol: normalizeNightSymbol(p.symbol, isPointNight),
        isDay: !isPointNight,
      })
      lastPreviewHour = h
      if (hourlyPreview.length >= 5) break
    }
  }

  const isCurrentNight =
    closestPoint?.isDay !== undefined ? !closestPoint.isDay : !isDaylight(currentTime)
  const resolvedDominant = isCurrentNight
    ? normalizeNightSymbol(dominantSymbol, true)
    : dominantSymbol

  // 1. Build 24-hour Rain Points (00:00 to 23:00) for today
  const rainPoints: HourlyRainPoint[] = []
  let peakRainMm = 0
  let peakRainHour: string | null = null

  // Map points by hour of day
  const hourMap = new Map<number, HourlyWeatherPoint>()
  for (const p of points) {
    const h = new Date(p.time).getHours()
    if (!hourMap.has(h)) {
      hourMap.set(h, p)
    }
  }


  for (let h = 0; h < 24; h++) {
    const pt = hourMap.get(h)
    const timeStr = `${String(h).padStart(2, '0')}:00`
    const precip = pt?.precipitationMm ?? 0
    const prob = pt?.precipitationProbability ?? (precip > 0 ? 70 : 0)
    const temp = pt?.temperature ?? Math.round(((minTemp + maxTemp) / 2) * 10) / 10
    const symbol = pt?.symbol ?? dominantSymbol

    if (precip > peakRainMm) {
      peakRainMm = precip
      peakRainHour = timeStr
    }

    rainPoints.push({
      timeStr,
      hour: h,
      precipitationMm: precip,
      precipitationProbability: prob,
      temp,
      symbol,
    })
  }

  const roundedTotalPrecip = Math.round(totalPrecip * 10) / 10
  const hasRain = roundedTotalPrecip >= 0.1 || peakRainMm >= 0.1
  const rainSummary = calculateRainSummary(
    rainPoints,
    roundedTotalPrecip,
    Math.round(maxProb),
    true,
  )

  return {
    currentTemp: closestPoint ? closestPoint.temperature : null,
    currentSymbol: closestPoint
      ? normalizeNightSymbol(closestPoint.symbol, isCurrentNight)
      : resolvedDominant,
    minTemp: Math.round(minTemp * 10) / 10,
    maxTemp: Math.round(maxTemp * 10) / 10,
    dominantSymbol: resolvedDominant,
    maxPrecipProbability: Math.round(maxProb),
    totalPrecipMm: roundedTotalPrecip,
    maxWindSpeed: Math.round(maxWind * 10) / 10,
    isStormWarning: isStorm,
    hourlyPreview,
    rainPoints,
    rainSummary,
    peakRainMm: Math.round(peakRainMm * 10) / 10,
    peakRainHour,
    hasRain,
  }
}

export function calculateRainSummary(
  rainPoints: HourlyRainPoint[],
  totalPrecipMm: number,
  maxPrecipProbability: number,
  isRestOfToday = false,
): string {
  const rainyHours = rainPoints.filter(
    (p) => p.precipitationMm >= 0.1 || p.precipitationProbability >= 60,
  )

  if (rainyHours.length === 0 || totalPrecipMm < 0.1) {
    if (maxPrecipProbability >= 40) {
      return 'Slight chance of drizzle'
    }
    return isRestOfToday ? 'Dry through midnight' : 'Dry throughout the day'
  }

  // Find peak hour
  let peak = rainyHours[0]
  for (const p of rainyHours) {
    if (p.precipitationMm > peak.precipitationMm) {
      peak = p
    }
  }

  const hours = rainyHours.map((p) => p.hour)
  const minHour = Math.min(...hours)
  const maxHour = Math.max(...hours)
  const startStr = `${String(minHour).padStart(2, '0')}:00`
  const endStr = `${String(Math.min(23, maxHour + 1)).padStart(2, '0')}:00`

  if (peak.precipitationMm >= 0.2) {
    return `~${startStr}–${endStr} · peak ${peak.precipitationMm} mm at ${peak.timeStr}`
  }

  return `~${startStr}–${endStr} (${totalPrecipMm} mm)`
}

export function calculateTomorrowForecast(points: HourlyWeatherPoint[]): TomorrowForecast | null {
  if (points.length === 0) return null

  const temps = points.map((p) => p.temperature)
  const minTemp = Math.min(...temps)
  const maxTemp = Math.max(...temps)
  const dominantSymbol = getDominantSymbol(points)

  let maxProb = 0
  let totalPrecip = 0
  let maxWind = 0
  let isStorm = false

  for (const p of points) {
    if (p.precipitationProbability && p.precipitationProbability > maxProb) {
      maxProb = p.precipitationProbability
    }
    totalPrecip += p.precipitationMm || 0
    if (p.windSpeedMs && p.windSpeedMs > maxWind) maxWind = p.windSpeedMs
    if (p.windGustMs && p.windGustMs > maxWind) maxWind = p.windGustMs
    if (p.isStormWarning) isStorm = true
  }

  // 1. Build 24-hour Rain Points (00:00 to 23:00)
  const rainPoints: HourlyRainPoint[] = []
  let peakRainMm = 0
  let peakRainHour: string | null = null

  // Map points by hour of day
  const hourMap = new Map<number, HourlyWeatherPoint>()
  for (const p of points) {
    const h = new Date(p.time).getHours()
    if (!hourMap.has(h)) {
      hourMap.set(h, p)
    }
  }

  // Generate complete 24-hour timeline
  for (let h = 0; h < 24; h++) {
    const pt = hourMap.get(h)
    const timeStr = `${String(h).padStart(2, '0')}:00`
    const precip = pt?.precipitationMm ?? 0
    const prob = pt?.precipitationProbability ?? (precip > 0 ? 70 : 0)
    const temp = pt?.temperature ?? Math.round(((minTemp + maxTemp) / 2) * 10) / 10
    const symbol = pt?.symbol ?? dominantSymbol

    if (precip > peakRainMm) {
      peakRainMm = precip
      peakRainHour = timeStr
    }

    rainPoints.push({
      timeStr,
      hour: h,
      precipitationMm: precip,
      precipitationProbability: prob,
      temp,
      symbol,
    })
  }

  const roundedTotalPrecip = Math.round(totalPrecip * 10) / 10
  const hasRain = roundedTotalPrecip >= 0.1 || peakRainMm >= 0.1
  const rainSummary = calculateRainSummary(rainPoints, roundedTotalPrecip, Math.round(maxProb))

  // 2. Window-aware Dayparts: Morning (06-12), Afternoon (12-18), Evening (18-24)
  // If rain occurs during the window, pick the peak rain/severity point so rain is never masked!
  const windows: Array<{
    label: DaypartPoint['label']
    startHour: number
    endHour: number
    defaultHour: number
  }> = [
    { label: 'Morning', startHour: 6, endHour: 12, defaultHour: 8 },
    { label: 'Afternoon', startHour: 12, endHour: 18, defaultHour: 14 },
    { label: 'Evening', startHour: 18, endHour: 24, defaultHour: 20 },
  ]

  const dayparts: DaypartPoint[] = []

  for (const win of windows) {
    const windowPoints = points.filter((p) => {
      const h = new Date(p.time).getHours()
      return h >= win.startHour && h < win.endHour
    })

    let selectedPoint: HourlyWeatherPoint | null = null

    if (windowPoints.length > 0) {
      // Check if any point in this window has precipitation
      const rainyInWindow = windowPoints.filter((p) => (p.precipitationMm || 0) >= 0.1)
      if (rainyInWindow.length > 0) {
        // Pick point with maximum precipitation in this window
        rainyInWindow.sort((a, b) => (b.precipitationMm || 0) - (a.precipitationMm || 0))
        selectedPoint = rainyInWindow[0]
      } else {
        // Check if higher severity condition exists (e.g. thunder, fog)
        windowPoints.sort(
          (a, b) => (SYMBOL_SEVERITY[b.symbol] ?? 0) - (SYMBOL_SEVERITY[a.symbol] ?? 0),
        )
        const highestSeverity = windowPoints[0]
        if ((SYMBOL_SEVERITY[highestSeverity.symbol] ?? 0) > 2) {
          selectedPoint = highestSeverity
        } else {
          // Pick closest to defaultHour
          let minDiff = Infinity
          for (const p of windowPoints) {
            const h = new Date(p.time).getHours()
            const diff = Math.abs(h - win.defaultHour)
            if (diff < minDiff) {
              minDiff = diff
              selectedPoint = p
            }
          }
        }
      }
    }

    // Fallback if window had no points
    if (!selectedPoint && points.length > 0) {
      let minDiff = Infinity
      for (const p of points) {
        const h = new Date(p.time).getHours()
        const diff = Math.abs(h - win.defaultHour)
        if (diff < minDiff) {
          minDiff = diff
          selectedPoint = p
        }
      }
    }

    if (selectedPoint) {
      const d = new Date(selectedPoint.time)
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:00`
      const isDaypartNight =
        selectedPoint.isDay !== undefined ? !selectedPoint.isDay : !isDaylight(d)
      dayparts.push({
        label: win.label,
        timeStr,
        point: {
          ...selectedPoint,
          symbol: normalizeNightSymbol(selectedPoint.symbol, isDaypartNight),
          isDay: !isDaypartNight,
        },
      })
    }
  }

  return {
    minTemp: Math.round(minTemp * 10) / 10,
    maxTemp: Math.round(maxTemp * 10) / 10,
    dominantSymbol,
    maxPrecipProbability: Math.round(maxProb),
    totalPrecipMm: roundedTotalPrecip,
    maxWindSpeed: Math.round(maxWind * 10) / 10,
    isStormWarning: isStorm,
    dayparts,
    rainPoints,
    rainSummary,
    peakRainMm: Math.round(peakRainMm * 10) / 10,
    peakRainHour,
    hasRain,
  }
}

/** One compact day of the week outlook, summarized the same way as the Tomorrow card. */
export interface DailyOutlook {
  /** Local calendar day, `yyyy-MM-dd`. */
  date: string
  minTemp: number | null
  maxTemp: number | null
  dominantSymbol: WeatherSymbol
  maxPrecipProbability: number
  totalPrecipMm: number
  maxWindSpeed: number
  isStormWarning: boolean
}

/** A day summarized from fewer hours than this (the ragged end of a forecast) would misstate its low and high. */
const MIN_HOURS_FOR_DAILY_OUTLOOK = 12

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Groups hourly points by local calendar day and summarizes each of the `days` days from
 * `startDate`. Days the forecast covers only partly are left out rather than shown with a
 * misleading low and high.
 */
export function calculateDailyOutlook(points: HourlyWeatherPoint[], startDate: Date, days: number): DailyOutlook[] {
  const byDay = new Map<string, HourlyWeatherPoint[]>()
  for (const point of points) {
    const key = localDayKey(new Date(point.time))
    const dayPoints = byDay.get(key)
    if (dayPoints) dayPoints.push(point)
    else byDay.set(key, [point])
  }

  const outlook: DailyOutlook[] = []
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + offset)
    const key = localDayKey(day)
    const dayPoints = byDay.get(key) ?? []
    const distinctHours = new Set(dayPoints.map((p) => new Date(p.time).getHours())).size
    if (distinctHours < MIN_HOURS_FOR_DAILY_OUTLOOK) continue
    const summary = calculateTomorrowForecast(dayPoints)
    if (!summary) continue
    outlook.push({
      date: key,
      minTemp: summary.minTemp,
      maxTemp: summary.maxTemp,
      dominantSymbol: summary.dominantSymbol,
      maxPrecipProbability: summary.maxPrecipProbability,
      totalPrecipMm: summary.totalPrecipMm,
      maxWindSpeed: summary.maxWindSpeed,
      isStormWarning: summary.isStormWarning,
    })
  }
  return outlook
}
