import { describe, expect, it } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { calculateDailyOutlook } from '../src/weatherForecast'
import { fmiWeatherProvider, openMeteoWeatherProvider } from '../src/providers'
import { weekForecastQueryKey, weekForecastQueryOptions } from '../src/query'
import type { WeatherProvider } from '../src/providerTypes'
import type { HourlyWeatherPoint } from '../src/weather'

function localIso(year: number, month: number, day: number, hour: number): string {
  return new Date(year, month - 1, day, hour).toISOString()
}

function hoursOfDay(year: number, month: number, day: number, hours: number[], overrides: Partial<HourlyWeatherPoint> = {}): HourlyWeatherPoint[] {
  return hours.map((hour) => ({
    time: localIso(year, month, day, hour),
    temperature: 5 + hour / 2,
    symbol: 'cloudy',
    precipitationMm: 0,
    precipitationProbability: 5,
    windSpeedMs: 4,
    ...overrides,
  }))
}

const allHours = Array.from({ length: 24 }, (_, hour) => hour)

describe('week outlook summaries', () => {
  it('summarizes each local day and leaves out days the forecast only partly covers', () => {
    const points = [
      ...hoursOfDay(2026, 10, 1, allHours),
      ...hoursOfDay(2026, 10, 2, allHours, { precipitationMm: 0.5, symbol: 'rain-light' }),
      ...hoursOfDay(2026, 10, 3, [0, 1, 2, 3, 4, 5]),
    ]

    const outlook = calculateDailyOutlook(points, new Date(2026, 9, 1), 3)

    expect(outlook.map((day) => day.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(outlook[0]).toMatchObject({ minTemp: 5, maxTemp: 16.5, totalPrecipMm: 0 })
    expect(outlook[1]?.totalPrecipMm).toBe(12)
    expect(outlook[1]?.dominantSymbol).not.toBe('cloudy')
  })

  it('asks Open-Meteo for enough days and keeps only the requested range', async () => {
    let requestedUrl = ''
    const times = Array.from({ length: 24 * 4 }, (_, i) => {
      const t = new Date(2026, 8, 28, i)
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:00`
    })
    const points = await openMeteoWeatherProvider.fetchWeekForecast!({
      startDate: new Date(2026, 8, 30),
      days: 2,
      now: new Date(2026, 8, 28, 12),
      config: { latitude: 60.1695, longitude: 24.9354 },
      transport: async (input) => {
        requestedUrl = String(input)
        return new Response(JSON.stringify({
          hourly: {
            time: times,
            temperature_2m: times.map(() => 10),
            weather_code: times.map(() => 3),
            precipitation: times.map(() => 0),
            precipitation_probability: times.map(() => 0),
            wind_speed_10m: times.map(() => 3),
            wind_gusts_10m: times.map(() => 5),
            wind_direction_10m: times.map(() => 180),
            is_day: times.map(() => 1),
          },
          daily: { time: ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'] },
        }), { status: 200 })
      },
    })

    expect(requestedUrl).toContain('forecast_days=4')
    expect(points).toHaveLength(48)
    expect(new Date(points[0]!.time).getDate()).toBe(30)
    expect(new Date(points[47]!.time).getDate()).toBe(1)
  })

  it('reads the week from the FMI edited forecast, which reaches past HARMONIE', async () => {
    let requestedUrl = ''
    await fmiWeatherProvider.fetchWeekForecast!({
      startDate: new Date(2026, 8, 30),
      days: 5,
      config: { place: 'Helsinki' },
      transport: async (input) => {
        requestedUrl = String(input)
        return new Response('<wfs:FeatureCollection></wfs:FeatureCollection>', { status: 200 })
      },
    })

    expect(requestedUrl).toContain('fmi::forecast::edited::weather::scandinavia::point::simple')
    expect(requestedUrl).toContain(`starttime=${new Date(2026, 8, 30).toISOString()}`)
    expect(requestedUrl).toContain(`endtime=${new Date(2026, 9, 5).toISOString()}`)
  })

  it('queries summaries per provider, place, and start day, and is empty for a provider without a week forecast', async () => {
    const provider: WeatherProvider = { id: 'plain', name: 'plain', description: 'plain', defaultConfig: {}, fetchForecast: async () => [] }
    const input = { provider, startDate: new Date(2026, 8, 30), days: 5, config: { place: 'Helsinki' } }
    expect(weekForecastQueryKey(input)).toEqual(['weather', 'week-outlook', 'plain', '2026-09-30', 5, { place: 'Helsinki' }])

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const outlook = await client.fetchQuery(weekForecastQueryOptions(input))
    expect(outlook).toEqual([])
    client.clear()
  })
})
