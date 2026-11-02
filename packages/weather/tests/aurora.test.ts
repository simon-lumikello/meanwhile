import { describe, expect, it } from 'bun:test'
import {
  evaluateAuroraVisibility,
  findKpForTimestamp,
  getKpThresholdForLatitude,
  isSkyFavorableForAurora,
} from '../src/core'
import { parseSwpcTimeTag } from '../src/providers'
import type { AuroraKpPoint, HourlyWeatherPoint } from '../src/core'

describe('Aurora Borealis Space Weather & Visibility Engine', () => {
  describe('getKpThresholdForLatitude', () => {
    it('returns low threshold (2.5) for high Arctic / Lapland', () => {
      expect(getKpThresholdForLatitude(67.4)).toBe(2.5) // Sodankylä
      expect(getKpThresholdForLatitude(66.5)).toBe(2.5) // Rovaniemi
    })

    it('returns moderate threshold (3.5) for Central / Northern Finland', () => {
      expect(getKpThresholdForLatitude(65.0)).toBe(3.5) // Oulu
      expect(getKpThresholdForLatitude(63.1)).toBe(3.5) // Vaasa
    })

    it('returns 4.5 for Southern Finland / Southern Scandinavia', () => {
      expect(getKpThresholdForLatitude(60.17)).toBe(4.5) // Helsinki
      expect(getKpThresholdForLatitude(61.5)).toBe(4.5)  // Tampere
      expect(getKpThresholdForLatitude(59.33)).toBe(5.0) // Stockholm (lat 59.33 -> < 60, >= 56)
    })

    it('scales symmetrically for Southern Hemisphere latitudes', () => {
      expect(getKpThresholdForLatitude(-67.0)).toBe(2.5)
      expect(getKpThresholdForLatitude(-42.88)).toBeGreaterThanOrEqual(6.0) // Hobart, Tasmania
    })
  })

  describe('parseSwpcTimeTag & findKpForTimestamp', () => {
    it('parses SWPC time_tag correctly to UTC Date', () => {
      const d1 = parseSwpcTimeTag('2026-09-09T21:00:00')
      expect(d1.getUTCHours()).toBe(21)

      const d2 = parseSwpcTimeTag('2026-09-09T18:00:00Z')
      expect(d2.getUTCHours()).toBe(18)
    })

    it('finds the closest Kp forecast point within 4 hours', () => {
      const mockKp: AuroraKpPoint[] = [
        { time: '2026-09-09T18:00:00Z', kp: 2.33, observed: 'observed', noaaScale: null },
        { time: '2026-09-09T21:00:00Z', kp: 5.0, observed: 'predicted', noaaScale: 'G1' },
        { time: '2026-09-10T00:00:00Z', kp: 4.67, observed: 'predicted', noaaScale: null },
      ]

      const target = new Date('2026-09-09T21:30:00Z')
      expect(findKpForTimestamp(mockKp, target)).toBe(5.0)

      const lateTarget = new Date('2026-09-09T23:45:00Z')
      expect(findKpForTimestamp(mockKp, lateTarget)).toBe(4.67)
    })

    it('returns null when no points are close', () => {
      const mockKp: AuroraKpPoint[] = [
        { time: '2026-09-09T00:00:00Z', kp: 1.0, observed: 'observed', noaaScale: null },
      ]
      const farTarget = new Date('2026-09-09T12:00:00Z')
      expect(findKpForTimestamp(mockKp, farTarget)).toBeNull()
    })
  })

  describe('isSkyFavorableForAurora', () => {
    it('returns true for clear night or partly cloudy night with no rain', () => {
      const clearNight: HourlyWeatherPoint = {
        time: '2026-09-09T22:00:00Z',
        temperature: 12,
        symbol: 'clear-night',
        precipitationMm: 0,
        precipitationProbability: 0,
        windSpeedMs: 3,
        isStormWarning: false,
        isDay: false,
      }
      expect(isSkyFavorableForAurora(clearNight)).toBe(true)

      const partlyCloudyNight: HourlyWeatherPoint = {
        ...clearNight,
        symbol: 'partly-cloudy-night',
      }
      expect(isSkyFavorableForAurora(partlyCloudyNight)).toBe(true)
    })

    it('returns false for overcast or rainy conditions', () => {
      const overcast: HourlyWeatherPoint = {
        time: '2026-09-09T22:00:00Z',
        temperature: 12,
        symbol: 'cloudy',
        precipitationMm: 0,
        precipitationProbability: 10,
        windSpeedMs: 3,
        isStormWarning: false,
        isDay: false,
      }
      expect(isSkyFavorableForAurora(overcast)).toBe(false)

      const raining: HourlyWeatherPoint = {
        ...overcast,
        symbol: 'clear-night',
        precipitationMm: 1.2,
      }
      expect(isSkyFavorableForAurora(raining)).toBe(false)
    })
  })

  describe('evaluateAuroraVisibility', () => {
    const helsinkiLat = 60.1695
    const helsinkiLon = 24.9354

    const mockKpPoints: AuroraKpPoint[] = [
      { time: '2026-09-09T18:00:00Z', kp: 2.0, observed: 'observed', noaaScale: null },
      { time: '2026-09-09T21:00:00Z', kp: 5.33, observed: 'predicted', noaaScale: 'G1' },
      { time: '2026-09-10T00:00:00Z', kp: 5.0, observed: 'predicted', noaaScale: 'G1' },
      { time: '2026-09-10T03:00:00Z', kp: 2.33, observed: 'predicted', noaaScale: null },
    ]

    it('detects aurora visibility on clear night with elevated Kp in Helsinki', () => {
      // 21:00 UTC (around 00:00 Finnish local time in summer/autumn) is dark and Kp is 5.33
      const currentTime = new Date('2026-09-09T20:00:00Z')
      const weatherPoints: HourlyWeatherPoint[] = [
        {
          time: '2026-09-09T20:00:00Z',
          temperature: 11,
          symbol: 'clear-night',
          precipitationMm: 0,
          precipitationProbability: 0,
          windSpeedMs: 2,
          isStormWarning: false,
          isDay: false,
        },
        {
          time: '2026-09-09T21:00:00Z',
          temperature: 10,
          symbol: 'clear-night',
          precipitationMm: 0,
          precipitationProbability: 0,
          windSpeedMs: 2,
          isStormWarning: false,
          isDay: false,
        },
        {
          time: '2026-09-09T22:00:00Z',
          temperature: 9,
          symbol: 'cloudy', // clouded over later
          precipitationMm: 0,
          precipitationProbability: 0,
          windSpeedMs: 2,
          isStormWarning: false,
          isDay: false,
        },
      ]

      const status = evaluateAuroraVisibility(
        mockKpPoints,
        weatherPoints,
        helsinkiLat,
        helsinkiLon,
        currentTime,
      )

      expect(status.hasAuroraTonight).toBe(true)
      expect(status.activeHourTimestamps).toContain('2026-09-09T21:00:00Z')
      // Cloudy hour at 22:00 should not be in active hours
      expect(status.activeHourTimestamps).not.toContain('2026-09-09T22:00:00Z')
      expect(status.peakKp).toBeCloseTo(5.33, 1)
      expect(status.summary).toContain('Aurora')
    })

    it('suppresses aurora when the sky is fully overcast despite storm-level Kp', () => {
      const currentTime = new Date('2026-09-09T20:00:00Z')
      const overcastWeather: HourlyWeatherPoint[] = [
        {
          time: '2026-09-09T21:00:00Z',
          temperature: 10,
          symbol: 'cloudy',
          precipitationMm: 0,
          precipitationProbability: 30,
          windSpeedMs: 4,
          isStormWarning: false,
          isDay: false,
        },
        {
          time: '2026-09-09T22:00:00Z',
          temperature: 9,
          symbol: 'rain-moderate',
          precipitationMm: 2.0,
          precipitationProbability: 90,
          windSpeedMs: 5,
          isStormWarning: false,
          isDay: false,
        },
      ]

      const status = evaluateAuroraVisibility(
        mockKpPoints,
        overcastWeather,
        helsinkiLat,
        helsinkiLon,
        currentTime,
      )

      expect(status.activeHourTimestamps).toHaveLength(0)
    })

    it('suppresses aurora during daytime hours when sunlight washes it out', () => {
      // 12:00 UTC in Helsinki is noon daylight
      const daytimeCurrent = new Date('2026-09-09T12:00:00Z')
      const daytimeWeather: HourlyWeatherPoint[] = [
        {
          time: '2026-09-09T12:00:00Z',
          temperature: 18,
          symbol: 'clear-day',
          precipitationMm: 0,
          precipitationProbability: 0,
          windSpeedMs: 2,
          isStormWarning: false,
          isDay: true,
        },
      ]

      const extremeStormKp: AuroraKpPoint[] = [
        { time: '2026-09-09T12:00:00Z', kp: 8.0, observed: 'observed', noaaScale: 'G4' },
      ]

      const status = evaluateAuroraVisibility(
        extremeStormKp,
        daytimeWeather,
        helsinkiLat,
        helsinkiLon,
        daytimeCurrent,
      )

      expect(status.hasAuroraTonight).toBe(false)
      expect(status.isCurrentlyVisible).toBe(false)
      expect(status.activeHourTimestamps).toHaveLength(0)
    })

    it('detects aurora for tomorrow evening when conditions align', () => {
      const tomorrowWeather: HourlyWeatherPoint[] = [
        {
          time: '2026-09-10T12:00:00Z', // daytime
          temperature: 15,
          symbol: 'clear-day',
          precipitationMm: 0,
          precipitationProbability: 0,
          windSpeedMs: 2,
          isStormWarning: false,
          isDay: true,
        },
        {
          time: '2026-09-10T21:00:00Z', // night
          temperature: 11,
          symbol: 'clear-night',
          precipitationMm: 0,
          precipitationProbability: 0,
          windSpeedMs: 2,
          isStormWarning: false,
          isDay: false,
        },
      ]

      const tomorrowKpPoints: AuroraKpPoint[] = [
        ...mockKpPoints,
        { time: '2026-09-10T21:00:00Z', kp: 5.0, observed: 'predicted', noaaScale: 'G1' },
      ]

      const status = evaluateAuroraVisibility(
        tomorrowKpPoints,
        [
          {
            time: '2026-09-09T20:00:00Z',
            temperature: 11,
            symbol: 'cloudy', // today is overcast
            precipitationMm: 0,
            precipitationProbability: 0,
            windSpeedMs: 2,
            isStormWarning: false,
            isDay: false,
          },
        ],
        helsinkiLat,
        helsinkiLon,
        new Date('2026-09-09T20:00:00Z'),
        tomorrowWeather,
      )

      expect(status.hasAuroraTonight).toBe(false)
      expect(status.tomorrow?.hasAurora).toBe(true)
      expect(status.tomorrow?.activeHourTimestamps).toContain('2026-09-10T21:00:00Z')
      expect(status.tomorrow?.summary).toContain('Aurora')
    })

    it('does not detect aurora for tomorrow when tomorrow evening promises heavy rain or overcast', () => {
      const rainyTomorrowWeather: HourlyWeatherPoint[] = [
        {
          time: '2026-09-10T12:00:00Z', // daytime
          temperature: 15,
          symbol: 'rain-heavy',
          precipitationMm: 4,
          precipitationProbability: 90,
          windSpeedMs: 5,
          isStormWarning: false,
          isDay: true,
        },
        {
          time: '2026-09-10T21:00:00Z', // night with heavy rain
          temperature: 10,
          symbol: 'rain-heavy',
          precipitationMm: 8.5,
          precipitationProbability: 95,
          windSpeedMs: 7,
          isStormWarning: false,
          isDay: false,
        },
      ]

      const stormKpPoints: AuroraKpPoint[] = [
        ...mockKpPoints,
        { time: '2026-09-10T21:00:00Z', kp: 5.5, observed: 'predicted', noaaScale: 'G1' },
      ]

      const status = evaluateAuroraVisibility(
        stormKpPoints,
        [
          {
            time: '2026-09-09T20:00:00Z',
            temperature: 11,
            symbol: 'clear-night',
            precipitationMm: 0,
            precipitationProbability: 0,
            windSpeedMs: 2,
            isStormWarning: false,
            isDay: false,
          },
        ],
        helsinkiLat,
        helsinkiLon,
        new Date('2026-09-09T20:00:00Z'),
        rainyTomorrowWeather,
      )

      expect(status.tomorrow?.hasAurora).toBeFalsy()
    })

    it('does not count early morning post-midnight hours towards tomorrow evening aurora', () => {
      const tomorrowWeatherWithEarlyMorningClear: HourlyWeatherPoint[] = [
        {
          time: '2026-09-10T00:00:00Z', // 03:00 local time (early morning overnight) -> clear sky
          temperature: 8,
          symbol: 'clear-night',
          precipitationMm: 0,
          precipitationProbability: 0,
          windSpeedMs: 2,
          isStormWarning: false,
          isDay: false,
        },
        {
          time: '2026-09-10T12:00:00Z', // daytime
          temperature: 15,
          symbol: 'rain-light',
          precipitationMm: 1.0,
          precipitationProbability: 60,
          windSpeedMs: 4,
          isStormWarning: false,
          isDay: true,
        },
        {
          time: '2026-09-10T21:00:00Z', // tomorrow evening -> heavy rain
          temperature: 10,
          symbol: 'rain-heavy',
          precipitationMm: 9.0,
          precipitationProbability: 95,
          windSpeedMs: 8,
          isStormWarning: false,
          isDay: false,
        },
      ]

      const highKpPoints: AuroraKpPoint[] = [
        ...mockKpPoints,
        { time: '2026-09-10T00:00:00Z', kp: 5.3, observed: 'predicted', noaaScale: 'G1' },
        { time: '2026-09-10T21:00:00Z', kp: 5.0, observed: 'predicted', noaaScale: 'G1' },
      ]

      const status = evaluateAuroraVisibility(
        highKpPoints,
        [
          {
            time: '2026-09-09T20:00:00Z',
            temperature: 11,
            symbol: 'clear-night',
            precipitationMm: 0,
            precipitationProbability: 0,
            windSpeedMs: 2,
            isStormWarning: false,
            isDay: false,
          },
        ],
        helsinkiLat,
        helsinkiLon,
        new Date('2026-09-09T20:00:00Z'),
        tomorrowWeatherWithEarlyMorningClear,
      )

      // Tomorrow card should NOT have aurora because tomorrow evening is heavy rain
      expect(status.tomorrow?.hasAurora).toBeFalsy()
    })

    it('marks isAuroraOngoing as true during nighttime geomagnetic storm even when cloudy', () => {
      // 22:00 local night in Helsinki with overcast sky (symbol: cloudy)
      const overcastNightWeather: HourlyWeatherPoint[] = [
        {
          time: '2026-09-09T20:00:00Z', // 23:00 Helsinki (EEST) -> astronomical night
          temperature: 11,
          symbol: 'cloudy', // Overcast!
          precipitationMm: 0,
          precipitationProbability: 20,
          windSpeedMs: 2,
          isStormWarning: false,
          isDay: false,
        },
      ]

      const stormKpPoints: AuroraKpPoint[] = [
        { time: '2026-09-09T20:00:00Z', kp: 5.67, observed: 'predicted', noaaScale: 'G1' },
      ]

      const status = evaluateAuroraVisibility(
        stormKpPoints,
        overcastNightWeather,
        helsinkiLat,
        helsinkiLon,
        new Date('2026-09-09T20:00:00Z'),
      )

      // Regular ground visibility is FALSE due to clouds
      expect(status.isCurrentlyVisible).toBe(false)
      // BUT ongoing space weather in ionosphere above the clouds is TRUE
      expect(status.isAuroraOngoing).toBe(true)
      expect(status.currentKp).toBe(5.67)
    })

    it('marks isAuroraOngoing as false during daylight hours even with strong storm', () => {
      // 12:00 midday in Helsinki
      const middayWeather: HourlyWeatherPoint[] = [
        {
          time: '2026-09-09T10:00:00Z', // 13:00 Helsinki
          temperature: 18,
          symbol: 'clear-day',
          precipitationMm: 0,
          precipitationProbability: 0,
          windSpeedMs: 3,
          isStormWarning: false,
          isDay: true,
        },
      ]

      const strongStormKp: AuroraKpPoint[] = [
        { time: '2026-09-09T10:00:00Z', kp: 7.0, observed: 'predicted', noaaScale: 'G3' },
      ]

      const status = evaluateAuroraVisibility(
        strongStormKp,
        middayWeather,
        helsinkiLat,
        helsinkiLon,
        new Date('2026-09-09T10:00:00Z'),
      )

      expect(status.isAuroraOngoing).toBe(false)
      expect(status.isCurrentlyVisible).toBe(false)
    })

    it('gracefully handles empty Kp or weather points', () => {
      const status = evaluateAuroraVisibility([], [], helsinkiLat, helsinkiLon, new Date())
      expect(status.hasAuroraTonight).toBe(false)
      expect(status.isCurrentlyVisible).toBe(false)
      expect(status.isAuroraOngoing).toBe(false)
      expect(status.activeHourTimestamps).toEqual([])
    })

    it('requires current sky data instead of assuming an expired or future forecast is clear', () => {
      const now = new Date('2026-09-09T20:00:00Z')
      const kp: AuroraKpPoint[] = [{ time: now.toISOString(), kp: 6, observed: 'predicted', noaaScale: 'G2' }]
      for (const time of ['2026-09-09T12:00:00Z', '2026-09-09T23:00:00Z', 'invalid']) {
        const status = evaluateAuroraVisibility(kp, [{ time, temperature: 10, precipitationMm: 0, symbol: 'clear-night' }], helsinkiLat, helsinkiLon, now)
        expect(status.isAuroraOngoing).toBe(true)
        expect(status.isCurrentlyVisible).toBe(false)
      }
    })

    it('uses the nearest current hour even near the end of the hour or with unordered points', () => {
      const now = new Date('2026-09-09T20:50:00Z')
      const kp: AuroraKpPoint[] = [{ time: now.toISOString(), kp: 6, observed: 'predicted', noaaScale: 'G2' }]
      const point: HourlyWeatherPoint = { time: '2026-09-09T20:00:00Z', temperature: 10, precipitationMm: 0, symbol: 'cloudy' }
      const future = { ...point, time: '2026-09-09T23:00:00Z', symbol: 'clear-night' as const }
      expect(evaluateAuroraVisibility(kp, [future, point], helsinkiLat, helsinkiLon, now).isCurrentlyVisible).toBe(false)
      expect(evaluateAuroraVisibility(kp, [{ ...point, symbol: 'clear-night' }], helsinkiLat, helsinkiLon, now).isCurrentlyVisible).toBe(true)
    })
  })
})
