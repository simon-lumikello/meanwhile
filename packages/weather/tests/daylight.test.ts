import { describe, it, expect } from 'bun:test'
import { calculateDaylightWindow, formatTimeLabel } from '../src/core'
import type { HourlyWeatherPoint } from '../src/core'

describe('Daylight Calculation & Sunrise/Sunset Engine', () => {
  it('formats time labels correctly for 24h and 12h modes', () => {
    const d1 = new Date('2026-09-12T06:40:00')
    expect(formatTimeLabel(d1, true)).toBe('06:40')
    expect(formatTimeLabel(d1, false)).toBe('6:40 AM')

    const d2 = new Date('2026-09-12T19:05:00')
    expect(formatTimeLabel(d2, true)).toBe('19:05')
    expect(formatTimeLabel(d2, false)).toBe('7:05 PM')

    const d3 = new Date('2026-09-12T00:00:00')
    expect(formatTimeLabel(d3, true)).toBe('00:00')
    expect(formatTimeLabel(d3, false)).toBe('12:00 AM')

    const d4 = new Date('2026-09-12T12:00:00')
    expect(formatTimeLabel(d4, true)).toBe('12:00')
    expect(formatTimeLabel(d4, false)).toBe('12:00 PM')
  })

  it('extracts daylight window from weather points containing explicit sunrise/sunset', () => {
    // 06:00 is 360 min -> 25%, 18:00 is 1080 min -> 75%
    const mockPoints: HourlyWeatherPoint[] = [
      {
        time: '2026-09-12T00:00:00',
        temperature: 12,
        symbol: 'clear-night',
        precipitationMm: 0,
        isDay: false,
        sunrise: '2026-09-12T06:00:00',
        sunset: '2026-09-12T18:00:00',
      },
      {
        time: '2026-09-12T12:00:00',
        temperature: 18,
        symbol: 'clear-day',
        precipitationMm: 0,
        isDay: true,
        sunrise: '2026-09-12T06:00:00',
        sunset: '2026-09-12T18:00:00',
      },
    ]

    const window = calculateDaylightWindow(mockPoints, { clock24h: true })
    expect(window).not.toBeNull()
    expect(window?.hasDaylight).toBe(true)
    expect(window?.isPolarDay).toBe(false)
    expect(window?.isPolarNight).toBe(false)
    expect(window?.startPercent).toBeCloseTo(25, 1)
    expect(window?.endPercent).toBeCloseTo(75, 1)
    expect(window?.sunriseLabel).toBe('06:00')
    expect(window?.sunsetLabel).toBe('18:00')
  })

  it('detects daylight window from isDay transitions when explicit sunrise/sunset is absent', () => {
    // Hourly points: night 00:00-05:00, day 06:00-19:00, night 20:00-23:00
    const mockPoints: HourlyWeatherPoint[] = []
    for (let h = 0; h < 24; h++) {
      const isDay = h >= 6 && h <= 19
      mockPoints.push({
        time: `2026-09-12T${String(h).padStart(2, '0')}:00:00`,
        temperature: 15,
        symbol: isDay ? 'clear-day' : 'clear-night',
        precipitationMm: 0,
        isDay,
      })
    }

    const window = calculateDaylightWindow(mockPoints, {
      clock24h: true,
      targetDate: new Date('2026-09-12T12:00:00'),
    })
    expect(window).not.toBeNull()
    expect(window?.hasDaylight).toBe(true)
    // 05:30 transition to day = 330 min -> ~22.9%
    // 19:30 transition to night = 1170 min -> ~81.25%
    expect(window?.startPercent).toBeGreaterThan(20)
    expect(window?.startPercent).toBeLessThan(30)
    expect(window?.endPercent).toBeGreaterThan(75)
    expect(window?.endPercent).toBeLessThan(85)
  })

  it('handles polar night (sun never rises)', () => {
    const mockPoints: HourlyWeatherPoint[] = []
    for (let h = 0; h < 24; h++) {
      mockPoints.push({
        time: `2026-12-21T${String(h).padStart(2, '0')}:00:00`,
        temperature: -10,
        symbol: 'cloudy',
        precipitationMm: 0,
        isDay: false,
      })
    }

    const window = calculateDaylightWindow(mockPoints)
    expect(window?.hasDaylight).toBe(false)
    expect(window?.isPolarNight).toBe(true)
    expect(window?.startPercent).toBe(0)
    expect(window?.endPercent).toBe(0)
  })

  it('handles polar day / midnight sun (sun never sets)', () => {
    const mockPoints: HourlyWeatherPoint[] = []
    for (let h = 0; h < 24; h++) {
      mockPoints.push({
        time: `2026-06-21T${String(h).padStart(2, '0')}:00:00`,
        temperature: 20,
        symbol: 'clear-day',
        precipitationMm: 0,
        isDay: true,
      })
    }

    const window = calculateDaylightWindow(mockPoints)
    expect(window?.hasDaylight).toBe(true)
    expect(window?.isPolarDay).toBe(true)
    expect(window?.startPercent).toBe(0)
    expect(window?.endPercent).toBe(100)
  })

  it('falls back gracefully to solar position model when points are empty but coords provided', () => {
    const date = new Date('2026-09-12T12:00:00Z')
    const window = calculateDaylightWindow([], {
      targetDate: date,
      lat: 60.1695,
      lon: 24.9354,
      clock24h: true,
    })
    expect(window).not.toBeNull()
    expect(window?.hasDaylight).toBe(true)
    expect(window?.startPercent).toBeGreaterThan(15)
    expect(window?.endPercent).toBeGreaterThan(65)
  })

  it('returns null when no points and no coordinates are provided', () => {
    expect(calculateDaylightWindow([])).toBeNull()
  })
})
