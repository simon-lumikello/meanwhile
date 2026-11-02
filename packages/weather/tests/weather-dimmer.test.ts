import { describe, expect, it } from 'bun:test'
import type { HourlyWeatherPoint, WeatherSymbol } from '../src/core'
import {
  calculateRestOfTodayForecast,
  calculateTomorrowForecast,
  getDominantSymbol,
  getWeatherSymbolLabel,
} from '../src/core'

describe('Weather Forecast Calculations for Dimmer Screen', () => {
  function createPoints(count: number, startHour = 0): HourlyWeatherPoint[] {
    return Array.from({ length: count }, (_, i) => {
      const h = startHour + i
      const d = new Date(2026, 8, 9, h, 0, 0)
      return {
        time: d.toISOString(),
        temperature: 15 + Math.sin(h / 4) * 5,
        symbol: (h >= 14 && h <= 16 ? 'rain-light' : h >= 22 || h < 6 ? 'clear-night' : 'clear-day') as WeatherSymbol,
        precipitationMm: h === 15 ? 1.5 : 0,
        precipitationProbability: h === 15 ? 65 : 10,
        windSpeedMs: 3.5,
        windGustMs: 6.0,
      }
    })
  }

  it('correctly maps weather symbols to readable labels', () => {
    expect(getWeatherSymbolLabel('clear-day')).toBe('Sunny & Clear')
    expect(getWeatherSymbolLabel('clear-night')).toBe('Clear Sky')
    expect(getWeatherSymbolLabel('rain-heavy')).toBe('Heavy Rain')
    expect(getWeatherSymbolLabel('thunder')).toBe('Thunderstorms')
    expect(getWeatherSymbolLabel('snow-light')).toBe('Light Snow')
  })

  it('selects dominant weather symbol based on severity', () => {
    const pts: HourlyWeatherPoint[] = [
      { time: '2026-09-09T08:00:00Z', temperature: 14, symbol: 'partly-cloudy-day', precipitationMm: 0 },
      { time: '2026-09-09T14:00:00Z', temperature: 18, symbol: 'rain-heavy', precipitationMm: 5.0 },
      { time: '2026-09-09T20:00:00Z', temperature: 12, symbol: 'cloudy', precipitationMm: 0 },
    ]
    expect(getDominantSymbol(pts)).toBe('rain-heavy')
  })

  it('calculates rest-of-today forecast when currentTime is evening (20:00)', () => {
    const points = createPoints(24, 0)
    const currentTime = new Date(2026, 8, 9, 20, 0, 0)

    const forecast = calculateRestOfTodayForecast(points, currentTime)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    // Nearest point to 20:00
    expect(forecast.currentTemp).toBeDefined()
    expect(forecast.hourlyPreview.length).toBeGreaterThanOrEqual(4)
    expect(forecast.hourlyPreview.length).toBeLessThanOrEqual(5)

    // Verify all preview points are from 20:00 onwards
    for (const p of forecast.hourlyPreview) {
      const h = new Date(p.time).getHours()
      expect(h).toBeGreaterThanOrEqual(19) // allow 30min grace
    }
  })

  it('gracefully handles late night (23:55) when few or no future points remain today', () => {
    const points = createPoints(24, 0)
    const currentTime = new Date(2026, 8, 9, 23, 55, 0)

    const forecast = calculateRestOfTodayForecast(points, currentTime)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    expect(forecast.currentTemp).toBeDefined()
    expect(forecast.hourlyPreview.length).toBeGreaterThanOrEqual(1)
  })

  it('calculates full tomorrow forecast with dayparts (Morning, Afternoon, Evening)', () => {
    const points = createPoints(24, 0)
    const forecast = calculateTomorrowForecast(points)

    expect(forecast).not.toBeNull()
    if (!forecast) return

    expect(forecast.minTemp).toBeDefined()
    expect(forecast.maxTemp).toBeDefined()
    expect(forecast.maxTemp!).toBeGreaterThanOrEqual(forecast.minTemp!)
    expect(forecast.totalPrecipMm).toBe(1.5)
    expect(forecast.maxPrecipProbability).toBe(65)

    expect(forecast.dayparts.length).toBe(3)
    expect(forecast.dayparts[0].label).toBe('Morning')
    expect(forecast.dayparts[1].label).toBe('Afternoon')
    expect(forecast.dayparts[2].label).toBe('Evening')
  })

  it('handles empty points array without throwing', () => {
    expect(calculateRestOfTodayForecast([], new Date())).toBeNull()
    expect(calculateTomorrowForecast([])).toBeNull()
    expect(getDominantSymbol([])).toBe('clear-day')
  })

  it('swaps sun icon for moon icon for hours of the day that are after sunset', () => {
    // 2026-09-09: Sunset in Helsinki/Jyväskylä is approx 19:50 (local UTC+3)
    // Points at 20:30 and 21:00 with 'clear-day' symbol should be normalized to 'clear-night'
    const points: HourlyWeatherPoint[] = [
      {
        time: '2026-09-09T14:00:00+03:00', // 14:00 daytime
        temperature: 16,
        symbol: 'clear-day',
        precipitationMm: 0,
        isDay: true,
      },
      {
        time: '2026-09-09T20:30:00+03:00', // 20:30 after sunset
        temperature: 12,
        symbol: 'clear-day', // raw API may mistakenly have clear-day
        precipitationMm: 0,
        isDay: false,
      },
      {
        time: '2026-09-09T21:00:00+03:00', // 21:00 after sunset
        temperature: 11,
        symbol: 'clear-day',
        precipitationMm: 0,
        isDay: false,
      },
      {
        time: '2026-09-09T22:00:00+03:00', // 22:00
        temperature: 10,
        symbol: 'partly-cloudy-day',
        precipitationMm: 0,
        isDay: false,
      },
    ]

    const currentTime = new Date('2026-09-09T20:30:00+03:00')
    const forecast = calculateRestOfTodayForecast(points, currentTime)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    // Dominant symbol for tonight must be a night symbol (Moon), NOT Sun
    expect(forecast.dominantSymbol).toBe('clear-night')
    expect(forecast.currentSymbol).toBe('clear-night')

    // Preview hours at 20:30 and 21:00 must use clear-night (Moon)
    const pt2030 = forecast.hourlyPreview.find((p) => p.time.includes('20:30'))
    expect(pt2030?.symbol).toBe('clear-night')

    const pt2100 = forecast.hourlyPreview.find((p) => p.time.includes('21:00'))
    expect(pt2100?.symbol).toBe('clear-night')

    const pt2200 = forecast.hourlyPreview.find((p) => p.time.includes('22:00'))
    expect(pt2200?.symbol).toBe('partly-cloudy-night')
  })

  it('generates 24-hour rainPoints and identifies peak precipitation', () => {
    // Rain in the afternoon from 13:00 to 16:00, peak 2.2 mm at 14:00
    const points: HourlyWeatherPoint[] = Array.from({ length: 24 }, (_, h) => ({
      time: `2026-09-10T${String(h).padStart(2, '0')}:00:00Z`,
      temperature: 14,
      symbol: h === 14 ? 'rain-moderate' : 'cloudy',
      precipitationMm: h === 13 ? 0.8 : h === 14 ? 2.2 : h === 15 ? 1.4 : 0,
      precipitationProbability: h >= 13 && h <= 15 ? 90 : 10,
    }))

    const forecast = calculateTomorrowForecast(points)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    expect(forecast.rainPoints.length).toBe(24)
    expect(forecast.peakRainMm).toBe(2.2)
    expect(forecast.peakRainHour).toBe('14:00')
    expect(forecast.hasRain).toBe(true)
    expect(forecast.totalPrecipMm).toBe(4.4)
    expect(forecast.rainSummary).toContain('13:00–16:00')
    expect(forecast.rainSummary).toContain('peak 2.2 mm at 14:00')
  })

  it('selects rain points inside morning and afternoon windows rather than missing them', () => {
    // 08:00 is cloudy with 0mm, but 10:00 has 1.8mm rain
    // 14:00 is partly cloudy with 0mm, but 16:00 has 2.5mm rain
    const points: HourlyWeatherPoint[] = [
      { time: '2026-09-10T08:00:00Z', temperature: 13, symbol: 'cloudy', precipitationMm: 0 },
      { time: '2026-09-10T10:00:00Z', temperature: 14, symbol: 'rain-moderate', precipitationMm: 1.8 },
      { time: '2026-09-10T14:00:00Z', temperature: 16, symbol: 'partly-cloudy-day', precipitationMm: 0 },
      { time: '2026-09-10T16:00:00Z', temperature: 15, symbol: 'rain-heavy', precipitationMm: 2.5 },
      { time: '2026-09-10T20:00:00Z', temperature: 11, symbol: 'cloudy', precipitationMm: 0 },
    ]

    const forecast = calculateTomorrowForecast(points)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    // Morning window (06-12) must select the 10:00 rain event, NOT dry 08:00
    const morning = forecast.dayparts.find((d) => d.label === 'Morning')
    expect(morning).toBeDefined()
    expect(morning?.point.symbol).toBe('rain-moderate')
    expect(morning?.point.precipitationMm).toBe(1.8)

    // Afternoon window (12-18) must select the 16:00 rain event, NOT dry 14:00
    const afternoon = forecast.dayparts.find((d) => d.label === 'Afternoon')
    expect(afternoon).toBeDefined()
    expect(afternoon?.point.symbol).toBe('rain-heavy')
    expect(afternoon?.point.precipitationMm).toBe(2.5)

    // Evening window has no rain, picks 20:00
    const evening = forecast.dayparts.find((d) => d.label === 'Evening')
    expect(evening).toBeDefined()
    expect(evening?.point.symbol).toBe('cloudy')
  })

  it('elevates dominant symbol to rain when total precipitation is significant even if provider had fog', () => {
    const points: HourlyWeatherPoint[] = [
      { time: '2026-09-10T04:00:00Z', temperature: 10, symbol: 'fog', precipitationMm: 0 },
      { time: '2026-09-10T08:00:00Z', temperature: 12, symbol: 'fog', precipitationMm: 0.8 },
      { time: '2026-09-10T12:00:00Z', temperature: 14, symbol: 'cloudy', precipitationMm: 1.2 },
      { time: '2026-09-10T16:00:00Z', temperature: 13, symbol: 'cloudy', precipitationMm: 1.0 },
    ]

    const forecast = calculateTomorrowForecast(points)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    // Total precip is 3.0 mm; dominant symbol should be rain-moderate, NOT fog
    expect(forecast.dominantSymbol).toBe('rain-moderate')
    expect(getWeatherSymbolLabel(forecast.dominantSymbol)).toBe('Showers / Rain')
  })

  it('elevates dominant symbol to snow instead of rain during winter sub-zero temperatures', () => {
    const points: HourlyWeatherPoint[] = [
      { time: '2026-01-15T08:00:00Z', temperature: -6, symbol: 'cloudy', precipitationMm: 1.5 },
      { time: '2026-01-15T12:00:00Z', temperature: -4, symbol: 'cloudy', precipitationMm: 2.0 },
      { time: '2026-01-15T16:00:00Z', temperature: -5, symbol: 'cloudy', precipitationMm: 1.0 },
      { time: '2026-01-15T20:00:00Z', temperature: -7, symbol: 'cloudy', precipitationMm: 0.5 },
    ]

    const forecast = calculateTomorrowForecast(points)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    // In sub-zero temperatures with 5.0 mm snowfall, dominant symbol must be snow, NOT rain
    expect(forecast.dominantSymbol).toBe('snow-light')
    expect(getWeatherSymbolLabel(forecast.dominantSymbol)).toBe('Light Snow')
  })

  it('produces "Dry throughout the day" when no precipitation is forecasted', () => {
    const points: HourlyWeatherPoint[] = Array.from({ length: 24 }, (_, h) => ({
      time: `2026-09-10T${String(h).padStart(2, '0')}:00:00Z`,
      temperature: 18,
      symbol: (h >= 7 && h <= 19 ? 'clear-day' : 'clear-night') as WeatherSymbol,
      precipitationMm: 0,
      precipitationProbability: 5,
    }))

    const forecast = calculateTomorrowForecast(points)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    expect(forecast.hasRain).toBe(false)
    expect(forecast.rainSummary).toBe('Dry throughout the day')
    expect(forecast.peakRainMm).toBe(0)
  })

  it('does not mark the whole day as heavy rain when rain is an isolated overnight spike', () => {
    // 05:00 has 1.5mm / rain-heavy, but daytime (07:00-21:00) is overcast with light showers (total 4.4 mm)
    const points: HourlyWeatherPoint[] = Array.from({ length: 24 }, (_, h) => ({
      time: `2026-09-10T${String(h).padStart(2, '0')}:00:00Z`,
      temperature: 14,
      symbol: (h === 5 ? 'rain-heavy' : h === 14 ? 'rain-light' : 'cloudy') as WeatherSymbol,
      precipitationMm: h === 5 ? 1.5 : h === 14 ? 0.8 : (h >= 1 && h <= 4 ? 0.5 : 0),
      precipitationProbability: h <= 6 ? 90 : h === 14 ? 60 : 15,
    }))

    const forecast = calculateTomorrowForecast(points)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    // Headline condition should be Light Rain (matching daytime), NOT Heavy Rain from 05:00 overnight spike
    expect(forecast.dominantSymbol).toBe('rain-light')
    expect(getWeatherSymbolLabel(forecast.dominantSymbol)).toBe('Light Rain')
  })

  it('does not mark an otherwise dry day as rainy when showers are confined to the evening edge (issue #14)', () => {
    // Sunny all day; rain only from 19:00-23:00 (peak 1mm at 21:00, ~5mm total), matching the
    // reported bug where an evening-only shower painted the whole "Tomorrow" card as "Showers / Rain".
    const points: HourlyWeatherPoint[] = Array.from({ length: 24 }, (_, h) => ({
      time: `2026-09-23T${String(h).padStart(2, '0')}:00:00Z`,
      temperature: h >= 7 && h <= 19 ? 14 : 8,
      symbol: (h >= 19 && h <= 23 ? 'rain-moderate' : h >= 7 && h <= 19 ? 'clear-day' : 'clear-night') as WeatherSymbol,
      precipitationMm: h >= 19 && h <= 23 ? 1.0 : 0,
      precipitationProbability: h >= 19 && h <= 23 ? 70 : 5,
    }))

    const forecast = calculateTomorrowForecast(points)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    // Rain data must still be fully reported (badges, timeline)...
    expect(forecast.hasRain).toBe(true)
    expect(forecast.totalPrecipMm).toBe(5.0)

    // ...but the headline condition should reflect the dry majority of the day, not the evening-only shower
    expect(forecast.dominantSymbol).not.toBe('rain-moderate')
    expect(getWeatherSymbolLabel(forecast.dominantSymbol)).not.toBe('Showers / Rain')

    // Evening daypart must still surface the rain
    const evening = forecast.dayparts.find((d) => d.label === 'Evening')
    expect(evening?.point.symbol).toBe('rain-moderate')
  })

  it('still marks a day as rainy when a severe evening storm is confined to the edge', () => {
    // Thunderstorm from 19:00-21:00 should still be surfaced even though it's edge-confined
    const points: HourlyWeatherPoint[] = Array.from({ length: 24 }, (_, h) => ({
      time: `2026-09-23T${String(h).padStart(2, '0')}:00:00Z`,
      temperature: h >= 7 && h <= 19 ? 16 : 10,
      symbol: (h >= 19 && h <= 21 ? 'thunder' : h >= 7 && h <= 19 ? 'clear-day' : 'clear-night') as WeatherSymbol,
      precipitationMm: h >= 19 && h <= 21 ? 4.0 : 0,
      precipitationProbability: h >= 19 && h <= 21 ? 85 : 5,
    }))

    const forecast = calculateTomorrowForecast(points)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    expect(forecast.dominantSymbol).toBe('thunder')
  })

  it('does not mark a day as rainy or overcast when rain ends overnight by 5am and daytime is sunny', () => {
    // Heavy/moderate rain overnight (00:00-05:00, 13.4mm total), then morning clouds clearing to afternoon sun
    const points: HourlyWeatherPoint[] = Array.from({ length: 24 }, (_, h) => ({
      time: `2026-09-27T${String(h).padStart(2, '0')}:00:00Z`,
      temperature: h >= 10 && h <= 18 ? 15 : h >= 7 ? 10 : 8,
      symbol: (h < 5
        ? 'rain-moderate'
        : h < 10
          ? 'cloudy'
          : h <= 18
            ? 'clear-day'
            : 'clear-night') as WeatherSymbol,
      precipitationMm: h === 0 ? 2.7 : h === 1 ? 2.5 : h === 2 ? 2.5 : h === 3 ? 2.5 : h === 4 ? 2.0 : h === 5 ? 1.2 : 0,
      precipitationProbability: h <= 5 ? 85 : 5,
    }))

    const forecast = calculateTomorrowForecast(points)
    expect(forecast).not.toBeNull()
    if (!forecast) return

    // 24h telemetry must reflect the rain that fell overnight
    expect(forecast.hasRain).toBe(true)
    expect(forecast.totalPrecipMm).toBe(13.4)
    expect(forecast.rainSummary).toContain('~00:00–06:00')

    // Headline condition must reflect active daytime waking hours: sunny & clear, NOT showers/rain or overcast
    expect(forecast.dominantSymbol).toBe('clear-day')
    expect(getWeatherSymbolLabel(forecast.dominantSymbol)).toBe('Sunny & Clear')

    // Dayparts should reflect their respective periods
    const morning = forecast.dayparts.find((d) => d.label === 'Morning')
    expect(morning?.point.symbol).toBe('cloudy')

    const afternoon = forecast.dayparts.find((d) => d.label === 'Afternoon')
    expect(afternoon?.point.symbol).toBe('clear-day')
  })
})
