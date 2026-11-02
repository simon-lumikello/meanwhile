import { describe, expect, it } from 'bun:test'
import { fetchKpForecast, openMeteoWeatherProvider, parseNoaaKpForecast, resetKpCache, searchWeatherLocations } from '../src/providers'

describe('weather provider adapters', () => {
  it('uses injected transport and cancellation for Open-Meteo requests', async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | null | undefined
    const points = await openMeteoWeatherProvider.fetchForecast({
      date: new Date('2026-09-21T12:00:00Z'),
      config: { latitude: 60.1695, longitude: 24.9354 },
      signal: controller.signal,
      transport: async (_input, init) => {
        receivedSignal = init?.signal
        return new Response(JSON.stringify({
          hourly: { time: ['2026-09-21T12:00:00Z'], temperature_2m: [12], weather_code: [0], precipitation: [0], precipitation_probability: [0], wind_speed_10m: [3], wind_gusts_10m: [4], wind_direction_10m: [90], is_day: [1] },
          daily: { time: ['2026-09-21'], sunrise: ['2026-09-21T04:00:00Z'], sunset: ['2026-09-21T17:00:00Z'] },
        }), { status: 200 })
      },
    })

    expect(receivedSignal).toBe(controller.signal)
    expect(points).toHaveLength(1)
    expect(points[0]?.symbol).toBe('clear-day')
  })

  it('keeps NOAA parsing and transport outside the aurora evaluator', async () => {
    resetKpCache()
    const parsed = parseNoaaKpForecast([{ time_tag: '2026-09-21T18:00:00', kp: '5.3', observed: 'predicted', noaa_scale: 'G1' }])
    expect(parsed[0]).toEqual({ time: '2026-09-21T18:00:00', kp: 5.3, observed: 'predicted', noaaScale: 'G1' })

    const points = await fetchKpForecast({
      now: new Date('2026-09-21T12:00:00Z'),
      transport: async () => new Response(JSON.stringify([{ time_tag: '2026-09-21T18:00:00', kp: '5.3', observed: 'predicted', noaa_scale: 'G1' }]), { status: 200 }),
    })
    expect(points).toEqual(parsed)
    resetKpCache()
  })

  it('uses provider-owned location lookup with a caller-provided transport', async () => {
    let requestedUrl = ''
    const results = await searchWeatherLocations('Helsinki', 'fmi', {
      transport: async (input) => {
        requestedUrl = String(input)
        return new Response(JSON.stringify({ results: [{ name: 'Helsinki', country: 'Finland', latitude: 60.1695, longitude: 24.9354 }] }), { status: 200 })
      },
    })

    expect(requestedUrl).toContain('countryCode=FI')
    expect(results).toEqual([{ name: 'Helsinki', country: 'Finland', latitude: 60.1695, longitude: 24.9354, admin1: undefined }])
  })
})
