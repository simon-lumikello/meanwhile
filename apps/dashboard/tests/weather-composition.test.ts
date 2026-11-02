import { describe, expect, it } from 'bun:test'
import type { HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import type { WeatherProvider } from '@simon-lumikello/meanwhile-weather/providers'
import type { RainProximityAlert } from '@simon-lumikello/meanwhile-radar/core'
import {
  blendRadarIntoTimeline,
  fetchDashboardWeatherForecast,
  reconcileRainAlertWithTimeline,
} from '@dashboard/services/weather/weatherComposition'

const today = new Date(2026, 8, 12, 14, 30)
const tomorrow = new Date(2026, 8, 13, 14, 30)

function point(hour: number, overrides: Partial<HourlyWeatherPoint> = {}): HourlyWeatherPoint {
  return {
    time: new Date(2026, 8, 12, hour).toISOString(),
    temperature: 16,
    symbol: 'cloudy',
    precipitationMm: 0,
    precipitationProbability: 5,
    isDay: true,
    ...overrides,
  }
}

function provider(id: string, points: HourlyWeatherPoint[], onFetch?: () => void): WeatherProvider {
  return {
    id,
    name: id,
    description: id,
    defaultConfig: {},
    fetchForecast: async () => {
      onFetch?.()
      return points
    },
  }
}

describe('dashboard weather composition', () => {
  it('starts the FMI forecast and radar requests together, then enriches the current and next hour', async () => {
    const calls: string[] = []
    const forecast = [point(13), point(14, { temperature: 17 }), point(15), point(17, { symbol: 'clear-day' })]

    const result = await fetchDashboardWeatherForecast(
      provider('fmi', forecast, () => calls.push('forecast')),
      today,
      { latitude: 60.1695, longitude: 24.9354 },
      {
        currentTime: today,
        fetchRadarRainRate: async (latitude, longitude) => {
          calls.push(`radar:${latitude}:${longitude}`)
          return 3.2
        },
      },
    )

    expect(calls).toEqual(['forecast', 'radar:60.1695:24.9354'])
    expect(result[0].precipitationMm).toBe(0)
    expect(result[1]).toMatchObject({ precipitationMm: 3.2, precipitationProbability: 95, symbol: 'rain-heavy' })
    expect(result[2]).toMatchObject({ precipitationMm: 1.9, precipitationProbability: 80, symbol: 'rain-moderate' })
    expect(result[3]).toMatchObject({ precipitationMm: 0, symbol: 'clear-day' })
  })

  it('leaves dry radar data and non-FMI or non-today forecasts unchanged', async () => {
    const forecast = [point(14)]
    let radarCalls = 0
    const fetchRadarRainRate = async () => {
      radarCalls += 1
      return 0.09
    }

    await expect(
      fetchDashboardWeatherForecast(provider('fmi', forecast), today, {}, { currentTime: today, fetchRadarRainRate }),
    ).resolves.toBe(forecast)
    await expect(
      fetchDashboardWeatherForecast(provider('open-meteo', forecast), today, {}, { currentTime: today, fetchRadarRainRate }),
    ).resolves.toBe(forecast)
    await expect(
      fetchDashboardWeatherForecast(provider('fmi', forecast), tomorrow, {}, { currentTime: today, fetchRadarRainRate }),
    ).resolves.toBe(forecast)

    expect(radarCalls).toBe(1)
  })

  it('keeps the provider forecast when radar lookup fails', async () => {
    const forecast = [point(14)]

    await expect(
      fetchDashboardWeatherForecast(provider('fmi', forecast), today, {}, {
        currentTime: today,
        fetchRadarRainRate: async () => Promise.reject(new Error('radar unavailable')),
      }),
    ).resolves.toBe(forecast)
  })

  it('preserves winter precipitation, past-hour, and midnight safeguards while blending', () => {
    const winter = [point(14, { temperature: -3 })]
    expect(blendRadarIntoTimeline(winter, 2, today, today)[0]).toMatchObject({
      precipitationMm: 2,
      symbol: 'snow-heavy',
    })

    const lateNight = new Date(2026, 8, 12, 23, 15)
    const nightlyForecast = [point(0, { isDay: false }), point(23, { isDay: false })]
    const result = blendRadarIntoTimeline(nightlyForecast, 4, lateNight, lateNight)

    expect(result[0]).toMatchObject({ precipitationMm: 0, symbol: 'cloudy' })
    expect(result[1]).toMatchObject({ precipitationMm: 4, symbol: 'rain-heavy' })
  })
})

describe('reconcileRainAlertWithTimeline', () => {
  function activeAlert(intensityMmH: number, summary: string): RainProximityAlert {
    return { status: 'active', type: 'rain', intensityMmH, summary, distanceKm: 0, updatedAt: today.toISOString() }
  }

  it('drops trace radar echoes the timeline does not show', () => {
    const alert = activeAlert(0.05, 'Drizzle falling now · <0.1 mm/h')
    expect(reconcileRainAlertWithTimeline(alert, [point(14, { precipitationMm: 1 })], today)).toBeNull()
  })

  it('reports the current hour timeline amount when it exceeds the radar rate', () => {
    const alert = activeAlert(0.3, 'Light rain falling now · 0.3 mm/h')
    const result = reconcileRainAlertWithTimeline(alert, [point(13, { precipitationMm: 4 }), point(14, { precipitationMm: 1 })], today)
    expect(result).toMatchObject({ intensityMmH: 1, summary: 'Moderate rain falling now · 1.0 mm/h' })
  })

  it('keeps the radar alert when it is at least the timeline amount', () => {
    const alert = activeAlert(2, 'Moderate rain falling now · 2.0 mm/h')
    expect(reconcileRainAlertWithTimeline(alert, [point(14, { precipitationMm: 1 })], today)).toBe(alert)
  })

  it('leaves approaching alerts alone', () => {
    const alert: RainProximityAlert = { ...activeAlert(0.5, 'Rain approaching in ~15–30 min (0.5 mm/h nearby)'), status: 'approaching' }
    expect(reconcileRainAlertWithTimeline(alert, [point(14, { precipitationMm: 3 })], today)).toBe(alert)
  })
})
