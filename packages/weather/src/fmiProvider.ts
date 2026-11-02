import { isSameDay } from 'date-fns'
import type { HourlyWeatherPoint, WeatherSymbol } from './weather'
import type { WeatherProvider } from './providerTypes'
import { isDaylight, getSolarTimes } from './solar'

export function mapFmiSymbol(code: number, isNight: boolean, precipMm = 0, temp?: number): WeatherSymbol {
  // If significant precipitation is falling, ensure symbol reflects it even if provider sent overcast/fog code
  if (precipMm >= 0.1 && (code <= 3 || (code >= 31 && code <= 33))) {
    if (temp !== undefined) {
      if (temp <= 0) return precipMm >= 1.5 ? 'snow-heavy' : 'snow-light'
      if (temp <= 1.5) return 'sleet'
    }
    if (precipMm >= 2.5) return 'rain-heavy'
    if (precipMm >= 0.8) return 'rain-moderate'
    return 'rain-light'
  }

  switch (code) {
    case 1: // Clear
      return isNight ? 'clear-night' : 'clear-day'
    case 2: // Partly cloudy
      return isNight ? 'partly-cloudy-night' : 'partly-cloudy-day'
    case 3: // Cloudy / Overcast
      return 'cloudy'
    case 21: // Light rain showers
    case 11:
      return 'rain-light'
    case 22: // Moderate rain
    case 23: // Heavy rain
      return code === 23 ? 'rain-heavy' : 'rain-moderate'
    case 31:
    case 32:
    case 33: // Fog
      return 'fog'
    case 41:
    case 42:
    case 43: // Sleet
      return 'sleet'
    case 51:
    case 52: // Light snow
      return 'snow-light'
    case 53: // Heavy snow
      return 'snow-heavy'
    case 61:
    case 62:
    case 63:
    case 64: // Thunder
      return 'thunder'
    default:
      return isNight ? 'clear-night' : 'clear-day'
  }
}

/**
 * Robust XML parser for FMI BsWfsElement that works across browser DOM and headless environments.
 */
export function parseFmiWfsXml(
  xmlText: string,
  targetDate: Date,
  lat = 60.1695,
  lon = 24.9354,
): HourlyWeatherPoint[] {
  // Map of timestamp -> Record<ParameterName, number>
  const pointMap = new Map<string, { time: string; temp?: number; symbolCode?: number; precip?: number; wind?: number; windDirection?: number }>()

  // Regex to extract BsWfsElement blocks
  const elementRegex = /<BsWfs:BsWfsElement[\s\S]*?<\/BsWfs:BsWfsElement>/gi
  const timeRegex = /<BsWfs:Time>([^<]+)<\/BsWfs:Time>/i
  const paramNameRegex = /<BsWfs:ParameterName>([^<]+)<\/BsWfs:ParameterName>/i
  const paramValRegex = /<BsWfs:ParameterValue>([^<]+)<\/BsWfs:ParameterValue>/i

  let match: RegExpExecArray | null
  while ((match = elementRegex.exec(xmlText)) !== null) {
    const block = match[0]
    const timeMatch = timeRegex.exec(block)
    const nameMatch = paramNameRegex.exec(block)
    const valMatch = paramValRegex.exec(block)

    if (!timeMatch || !nameMatch || !valMatch) continue

    const timeStr = timeMatch[1].trim()
    const pointDate = new Date(timeStr)

    // Filter to target day
    if (!isSameDay(pointDate, targetDate)) continue

    const paramName = nameMatch[1].trim()
    const numVal = parseFloat(valMatch[1].trim())

    if (isNaN(numVal)) continue

    let existing = pointMap.get(timeStr)
    if (!existing) {
      existing = { time: timeStr }
      pointMap.set(timeStr, existing)
    }

    if (paramName === 'Temperature' || paramName === 't2m') {
      existing.temp = numVal
    } else if (paramName === 'WeatherSymbol3') {
      existing.symbolCode = Math.round(numVal)
    } else if (paramName === 'Precipitation1h' || paramName === 'r_1h') {
      existing.precip = numVal
    } else if (paramName === 'WindSpeedMS' || paramName === 'ws_10min') {
      existing.wind = numVal
    } else if (paramName === 'WindDirection' || paramName === 'wd_10min') {
      existing.windDirection = numVal
    }
  }

  // Convert map to sorted HourlyWeatherPoint[]
  const results: HourlyWeatherPoint[] = []
  const sortedTimes = Array.from(pointMap.keys()).sort()
  const { sunrise, sunset } = getSolarTimes(targetDate, lat, lon)
  const sunriseStr = sunrise.toISOString()
  const sunsetStr = sunset.toISOString()

  for (const time of sortedTimes) {
    const data = pointMap.get(time)!
    const dateObj = new Date(time)
    const isDay = isDaylight(dateObj, lat, lon)
    const isNight = !isDay

    const temp = data.temp ?? 15
    const symbolCode = data.symbolCode ?? 1
    const precip = data.precip ?? 0
    const wind = data.wind ?? 3
    const windDir = data.windDirection

    const precipMm = Math.max(0, Math.round(precip * 10) / 10)
    results.push({
      time,
      temperature: Math.round(temp * 10) / 10,
      symbol: mapFmiSymbol(symbolCode, isNight, precipMm, temp),
      precipitationMm: precipMm,
      precipitationProbability: precip > 0 ? Math.min(100, Math.round(precip * 40 + 30)) : 5,
      windSpeedMs: Math.round(wind * 10) / 10,
      windDirectionDeg: windDir !== undefined ? Math.round(windDir) : undefined,
      isStormWarning: wind >= 14,
      isDay,
      sunrise: sunriseStr,
      sunset: sunsetStr,
    })
  }

  return results
}

export const fmiWeatherProvider: WeatherProvider = {
  id: 'fmi',
  name: 'Ilmatieteenlaitos (FMI)',
  description: 'Official high-resolution forecast by Finnish Meteorological Institute',
  defaultConfig: {
    place: 'Helsinki',
  },
  // HARMONIE reaches only about two and a half days ahead; the meteorologist-edited
  // Scandinavia forecast covers the rest of the week, hourly.
  async fetchWeekForecast({ startDate, days, config, signal, transport = fetch }): Promise<HourlyWeatherPoint[]> {
    const place = config.place || 'Helsinki'
    const lat = config.latitude ?? 60.1695
    const lon = config.longitude ?? 24.9354
    const dayDates = Array.from({ length: days }, (_, offset) =>
      new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + offset))
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + days)
    const url = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::edited::weather::scandinavia::point::simple&place=${encodeURIComponent(
      place
    )}&parameters=Temperature,WeatherSymbol3,Precipitation1h,WindSpeedMS,WindDirection&timestep=60&starttime=${dayDates[0]?.toISOString() ?? startDate.toISOString()}&endtime=${endDate.toISOString()}`

    const response = await transport(url, { cache: 'no-cache', signal })
    if (!response.ok) {
      throw new Error(`FMI service responded with HTTP ${response.status}`)
    }
    const xml = await response.text()
    return dayDates.flatMap(day => parseFmiWfsXml(xml, day, lat, lon))
  },
  async fetchForecast({ date, config, signal, now = new Date(), transport = fetch }): Promise<HourlyWeatherPoint[]> {
    const place = config.place || 'Helsinki'
    const lat = config.latitude ?? 60.1695
    const lon = config.longitude ?? 24.9354
    const url = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::harmonie::surface::point::simple&place=${encodeURIComponent(
      place
    )}&parameters=Temperature,WeatherSymbol3,Precipitation1h,WindSpeedMS,WindDirection&timestep=30`

    const isToday = isSameDay(date, now)
    
    let obsUrl = ''
    if (isToday) {
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      obsUrl = `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::weather::simple&place=${encodeURIComponent(
        place
      )}&parameters=t2m,r_1h,ws_10min,wd_10min&timestep=60&starttime=${startOfDay.toISOString()}`
    }

    const [response, obsResponse] = await Promise.all([
      transport(url, { cache: 'no-cache', signal }),
      isToday ? transport(obsUrl, { cache: 'no-cache', signal }).catch(() => null) : Promise.resolve(null),
    ])

    if (!response.ok) {
      throw new Error(`FMI service responded with HTTP ${response.status}`)
    }
    
    const xml = await response.text()
    const forecastPoints = parseFmiWfsXml(xml, date, lat, lon)
    
    let obsPoints: HourlyWeatherPoint[] = []
    if (obsResponse && obsResponse.ok) {
      try {
        const obsXml = await obsResponse.text()
        obsPoints = parseFmiWfsXml(obsXml, date, lat, lon)
      } catch (err) {
        console.warn('Failed to parse FMI observations', err)
      }
    }
    
    // Merge observations and forecast points. 
    // Observations take precedence for past hours.
    const pointMap = new Map<string, HourlyWeatherPoint>()
    for (const p of forecastPoints) {
      pointMap.set(p.time, p)
    }
    for (const p of obsPoints) {
      pointMap.set(p.time, p) // overwrites forecast with actual observations if they share the same time
    }
    
    let points = Array.from(pointMap.values()).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

    // Harmonie forecast model only starts near model run time (e.g. 10:30).
    // Backfill earlier hours from 00:00 so the day timeline does not abruptly start mid-day
    // (This is primarily needed if the observations API fails)
    let finalPoints = points
    if (points.length > 0) {
      const firstPointDate = new Date(points[0].time)
      const firstMinutes = firstPointDate.getHours() * 60 + firstPointDate.getMinutes()
      if (firstMinutes > 30) {
        const prepended: HourlyWeatherPoint[] = []
        const basePoint = points[0]
        for (let m = 0; m < firstMinutes; m += 30) {
          const h = Math.floor(m / 60)
          const min = m % 60
          const d = new Date(date)
          d.setHours(h, min, 0, 0)
          const isDay = isDaylight(d, lat, lon)
          const isNight = !isDay
          prepended.push({
            time: d.toISOString(),
            temperature: Math.round((basePoint.temperature - (isNight ? 2 : 0.8)) * 10) / 10,
            symbol: mapFmiSymbol(isNight ? 1 : 2, isNight),
            precipitationMm: 0,
            precipitationProbability: 0,
            windSpeedMs: basePoint.windSpeedMs,
            windDirectionDeg: basePoint.windDirectionDeg,
            isStormWarning: false,
            isDay,
            sunrise: basePoint.sunrise,
            sunset: basePoint.sunset,
          })
        }
        finalPoints = [...prepended, ...points]
      }
    }

    return finalPoints
  },
}
