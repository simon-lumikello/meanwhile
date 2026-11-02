import { differenceInCalendarDays, isSameDay } from 'date-fns'
import type { HourlyWeatherPoint, WeatherSymbol } from './weather'
import type { WeatherProvider, WeatherTransport } from './providerTypes'

export function mapWmoCode(code: number, isNight: boolean, precipMm = 0, temp?: number): WeatherSymbol {
  // If significant precipitation is falling, ensure symbol reflects it even if provider sent overcast/fog code
  if (precipMm >= 0.1 && (code < 51 || code > 99)) {
    if (temp !== undefined) {
      if (temp <= 0) return precipMm >= 1.5 ? 'snow-heavy' : 'snow-light'
      if (temp <= 1.5) return 'sleet'
    }
    if (precipMm >= 2.5) return 'rain-heavy'
    if (precipMm >= 0.8) return 'rain-moderate'
    return 'rain-light'
  }

  if (code === 0) return isNight ? 'clear-night' : 'clear-day'
  if (code === 1 || code === 2) return isNight ? 'partly-cloudy-night' : 'partly-cloudy-day'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ([51, 53, 55, 61, 80].includes(code)) return 'rain-light'
  if ([63, 81].includes(code)) return 'rain-moderate'
  if ([65, 82].includes(code)) return 'rain-heavy'
  if ([66, 67].includes(code)) return 'sleet'
  if ([71, 73, 85].includes(code)) return 'snow-light'
  if ([75, 86].includes(code)) return 'snow-heavy'
  if ([95, 96, 99].includes(code)) return 'thunder'
  return isNight ? 'clear-night' : 'clear-day'
}

export const openMeteoWeatherProvider: WeatherProvider = {
  id: 'open-meteo',
  name: 'Open-Meteo (Global)',
  description: 'Worldwide open forecast by Open-Meteo (zero key required)',
  defaultConfig: {
    latitude: 60.1695,
    longitude: 24.9354,
    cityName: 'Helsinki',
  },
  async fetchForecast({ date, config, signal, transport = fetch }): Promise<HourlyWeatherPoint[]> {
    const data = await fetchOpenMeteoHourly(config.latitude ?? 60.1695, config.longitude ?? 24.9354, undefined, signal, transport)
    return parseOpenMeteoHourly(data, ptDate => isSameDay(ptDate, date))
  },
  async fetchWeekForecast({ startDate, days, config, signal, now = new Date(), transport = fetch }): Promise<HourlyWeatherPoint[]> {
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + days)
    const forecastDays = Math.max(1, Math.min(MAX_FORECAST_DAYS, differenceInCalendarDays(endDate, now)))
    const data = await fetchOpenMeteoHourly(config.latitude ?? 60.1695, config.longitude ?? 24.9354, forecastDays, signal, transport)
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    return parseOpenMeteoHourly(data, ptDate => ptDate >= start && ptDate < endDate)
  },
}

/** Open-Meteo's forecast reaches this many days ahead. */
const MAX_FORECAST_DAYS = 16

interface OpenMeteoHourlyResponse {
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    weather_code?: number[]
    precipitation?: number[]
    precipitation_probability?: number[]
    wind_speed_10m?: number[]
    wind_gusts_10m?: number[]
    wind_direction_10m?: number[]
    is_day?: number[]
  }
  daily?: { time?: string[]; sunrise?: string[]; sunset?: string[] }
}

async function fetchOpenMeteoHourly(
  lat: number,
  lon: number,
  forecastDays: number | undefined,
  signal: AbortSignal | undefined,
  transport: WeatherTransport,
): Promise<OpenMeteoHourlyResponse> {
  const daysParam = forecastDays === undefined ? '' : `&forecast_days=${forecastDays}`
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weather_code,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day&daily=sunrise,sunset&wind_speed_unit=ms&timezone=auto${daysParam}`

  const res = await transport(url, { cache: 'no-cache', signal })
  if (!res.ok) {
    throw new Error(`Open-Meteo responded with HTTP ${res.status}`)
  }
  return res.json()
}

function parseOpenMeteoHourly(data: OpenMeteoHourlyResponse, includePoint: (ptDate: Date) => boolean): HourlyWeatherPoint[] {
  const times = data.hourly?.time || []
  const temps = data.hourly?.temperature_2m || []
  const codes = data.hourly?.weather_code || []
  const precips = data.hourly?.precipitation || []
  const probs = data.hourly?.precipitation_probability || []
  const winds = data.hourly?.wind_speed_10m || []
  const gusts = data.hourly?.wind_gusts_10m || []
  const windDirections = data.hourly?.wind_direction_10m || []
  const isDayArr = data.hourly?.is_day || []

  const dailyTimes = data.daily?.time || []
  const dailySunrises = data.daily?.sunrise || []
  const dailySunsets = data.daily?.sunset || []

  const points: HourlyWeatherPoint[] = []

  for (let i = 0; i < times.length; i++) {
    const timeStr = times[i]
    const ptDate = new Date(timeStr)
    if (!includePoint(ptDate)) continue

    const dayIdx = dailyTimes.findIndex((t) => isSameDay(new Date(t), ptDate))
    const hour = ptDate.getHours()
    // Open-Meteo provides exact is_day (1 = day, 0 = night) based on sunset/sunrise
    const isDay = isDayArr[i] !== undefined ? isDayArr[i] === 1 : (hour >= 6 && hour < 22)
    const isNight = !isDay
    const windSpeed = winds[i] ?? 0
    const windGust = gusts[i] ?? windSpeed
    const windDir = windDirections[i]

    const precipAmount = precips[i] ?? 0
    points.push({
      time: timeStr,
      temperature: Math.round(temps[i] * 10) / 10,
      symbol: mapWmoCode(codes[i] ?? 0, isNight, precipAmount, temps[i]),
      precipitationMm: precipAmount,
      precipitationProbability: probs[i] ?? (precipAmount > 0 ? 70 : 0),
      windSpeedMs: Math.round(windSpeed * 10) / 10,
      windGustMs: Math.round(windGust * 10) / 10,
      windDirectionDeg: windDir !== undefined ? Math.round(windDir) : undefined,
      isStormWarning: windGust >= 14 || windSpeed >= 14,
      isDay,
      sunrise: dayIdx !== -1 ? dailySunrises[dayIdx] : undefined,
      sunset: dayIdx !== -1 ? dailySunsets[dayIdx] : undefined,
    })
  }

  return points
}
