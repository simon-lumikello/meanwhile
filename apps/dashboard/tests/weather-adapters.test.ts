import { describe, expect, it } from 'bun:test'
import { mapFmiSymbol, parseFmiWfsXml } from '@simon-lumikello/meanwhile-weather/providers'
import { mapWmoCode } from '@simon-lumikello/meanwhile-weather/providers'
import type { HourlyWeatherPoint, WeatherSymbol } from '@simon-lumikello/meanwhile-weather/core'
import {
  calculatePrecipitationBarHeight,
  getNearestPastWeatherPoint,
  getWeatherPointVisibility,
} from '@dashboard/features/timeline/weatherSwimlaneData'

describe('Weather Provider Adapters & Threshold Logic', () => {
  it('correctly maps FMI weather codes to normalized symbols', () => {
    // 1 -> clear day / night
    expect(mapFmiSymbol(1, false)).toBe('clear-day')
    expect(mapFmiSymbol(1, true)).toBe('clear-night')

    // 2 -> partly cloudy
    expect(mapFmiSymbol(2, false)).toBe('partly-cloudy-day')
    expect(mapFmiSymbol(2, true)).toBe('partly-cloudy-night')

    // 21 -> light rain, 23 -> heavy rain
    expect(mapFmiSymbol(21, false)).toBe('rain-light')
    expect(mapFmiSymbol(23, false)).toBe('rain-heavy')

    // 51 -> light snow, 53 -> heavy snow
    expect(mapFmiSymbol(51, false)).toBe('snow-light')
    expect(mapFmiSymbol(53, false)).toBe('snow-heavy')

    // 61 -> thunder
    expect(mapFmiSymbol(61, false)).toBe('thunder')

    // Sub-zero winter precipitation overrides
    expect(mapFmiSymbol(3, false, 2.0, -5)).toBe('snow-heavy')
    expect(mapFmiSymbol(3, false, 0.5, -2)).toBe('snow-light')
    expect(mapFmiSymbol(3, false, 1.0, 1.0)).toBe('sleet')
  })

  it('correctly maps WMO codes to normalized symbols', () => {
    expect(mapWmoCode(0, false)).toBe('clear-day')
    expect(mapWmoCode(3, false)).toBe('cloudy')
    expect(mapWmoCode(61, false)).toBe('rain-light')
    expect(mapWmoCode(65, false)).toBe('rain-heavy')
    expect(mapWmoCode(71, false)).toBe('snow-light')
    expect(mapWmoCode(95, false)).toBe('thunder')

    // Sub-zero winter precipitation overrides
    expect(mapWmoCode(3, false, 2.0, -8)).toBe('snow-heavy')
    expect(mapWmoCode(3, false, 0.4, -1)).toBe('snow-light')
    expect(mapWmoCode(3, false, 1.2, 0.8)).toBe('sleet')
  })

  it('parses real-world FMI WFS XML and extracts weather points', () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:BsWfs="http://xml.fmi.fi/schema/wfs/2.0">
  <wfs:member>
    <BsWfs:BsWfsElement>
      <BsWfs:Time>2026-09-05T08:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>Temperature</BsWfs:ParameterName>
      <BsWfs:ParameterValue>15.5</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement>
      <BsWfs:Time>2026-09-05T08:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>WeatherSymbol3</BsWfs:ParameterName>
      <BsWfs:ParameterValue>21.0</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement>
      <BsWfs:Time>2026-09-05T08:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>Precipitation1h</BsWfs:ParameterName>
      <BsWfs:ParameterValue>1.8</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement>
      <BsWfs:Time>2026-09-05T08:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>WindSpeedMS</BsWfs:ParameterName>
      <BsWfs:ParameterValue>15.2</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement>
      <BsWfs:Time>2026-09-05T08:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>WindDirection</BsWfs:ParameterName>
      <BsWfs:ParameterValue>225.0</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
</wfs:FeatureCollection>`

    const targetDate = new Date(2026, 8, 5)
    const points = parseFmiWfsXml(mockXml, targetDate)

    expect(points.length).toBe(1)
    const pt = points[0]
    expect(pt.temperature).toBe(15.5)
    expect(pt.symbol).toBe('rain-light')
    expect(pt.precipitationMm).toBe(1.8)
    expect(pt.windSpeedMs).toBe(15.2)
    expect(pt.windDirectionDeg).toBe(225)
    // Wind >= 14 m/s must trigger isStormWarning flag
    expect(pt.isStormWarning).toBe(true)
  })

  it('clusters weather points appropriately on compact screens without overlapping', () => {
    // Generate 24 hourly points
    const points = Array.from({ length: 24 }, (_, h) => ({
      time: new Date(2026, 8, 5, h, 0, 0).toISOString(),
      temperature: 15 + Math.sin(h / 3) * 5,
      symbol: (h === 13 ? 'rain-heavy' : 'cloudy') as WeatherSymbol,
      precipitationMm: h === 13 ? 4.5 : 0,
    }))

    // Helper replicating clustering logic from WeatherSwimlane
    function clusterPoints(pts: typeof points, availablePx: number, isHorizontal: boolean) {
      const minSpacing = isHorizontal ? 56 : 34
      const maxItems = Math.max(1, Math.floor(availablePx / minSpacing))
      const candidateSteps = [1, 2, 3, 4, 6, 8, 12]
      const neededStep = 24 / maxItems
      const stepHours = candidateSteps.find((s) => s >= neededStep) || 12

      if (stepHours === 1 && pts.length <= 24) return pts

      const buckets: Record<number, typeof points> = {}
      for (const pt of pts) {
        const d = new Date(pt.time)
        const hour = d.getHours()
        const bucketIdx = Math.floor(hour / stepHours)
        if (!buckets[bucketIdx]) buckets[bucketIdx] = []
        buckets[bucketIdx].push(pt)
      }

      const result: typeof points = []
      const totalBuckets = Math.ceil(24 / stepHours)

      for (let b = 0; b < totalBuckets; b++) {
        const bucketPts = buckets[b]
        if (!bucketPts || bucketPts.length === 0) continue

        const rainPt = [...bucketPts].sort((a, b) => b.precipitationMm - a.precipitationMm)[0]
        if (rainPt && rainPt.precipitationMm > 0) {
          result.push(rainPt)
          continue
        }

        const targetHour = b * stepHours
        const bestPt = bucketPts.reduce((prev, curr) => {
          const prevDiff = Math.abs(new Date(prev.time).getHours() - targetHour)
          const currDiff = Math.abs(new Date(curr.time).getHours() - targetHour)
          return currDiff < prevDiff ? curr : prev
        }, bucketPts[0])

        result.push(bestPt)
      }

      return result
    }

    // On 320px vertical canvas (iPhone landscape), maxItems = 9, step = 3
    const compactClustered = clusterPoints(points, 320, false)
    expect(compactClustered.length).toBe(8) // 24 / 3 = 8 items

    // Verify distance between items is at least 34px
    const pixelPositions = compactClustered.map((_, i) => (i * 3 / 24) * 320)
    for (let i = 1; i < pixelPositions.length; i++) {
      expect(pixelPositions[i] - pixelPositions[i - 1]).toBeGreaterThanOrEqual(34)
    }

    // Verify rain event at 13:00 is preserved in its bucket
    const rainEvent = compactClustered.find((p) => p.precipitationMm > 0)
    expect(rainEvent).toBeDefined()
    expect(rainEvent?.symbol).toBe('rain-heavy')

    // On 1200px desktop horizontal canvas, all 24 points are rendered
    const desktopPoints = clusterPoints(points, 1400, true)
    expect(desktopPoints.length).toBe(24)
  })

  it('accurately determines daylight vs nighttime from solar coordinates', async () => {
    const { isDaylight, getSolarTimes } = await import('@simon-lumikello/meanwhile-weather/core')
    const helsinkiLat = 60.1695
    const helsinkiLon = 24.9354

    const date = new Date('2026-09-09T12:00:00Z') // Sep 9, 2026 UTC
    const { sunrise, sunset } = getSolarTimes(date, helsinkiLat, helsinkiLon)

    // In early September in Helsinki, sunrise is ~03:30 UTC and sunset is ~17:00 UTC
    expect(sunrise.getUTCHours()).toBeGreaterThanOrEqual(3)
    expect(sunrise.getUTCHours()).toBeLessThanOrEqual(4)
    expect(sunset.getUTCHours()).toBeGreaterThanOrEqual(16)
    expect(sunset.getUTCHours()).toBeLessThanOrEqual(18)

    // 14:00 in Finland (EEST UTC+3) is 11:00 UTC -> daylight
    const midday = new Date('2026-09-09T14:00:00+03:00')
    expect(isDaylight(midday, helsinkiLat, helsinkiLon)).toBe(true)

    // 21:00 in Finland (EEST UTC+3) is 18:00 UTC -> night (after 17:00 UTC sunset)
    const lateNight = new Date('2026-09-09T21:00:00+03:00')
    expect(isDaylight(lateNight, helsinkiLat, helsinkiLon)).toBe(false)

    // 04:00 in Finland (EEST UTC+3) is 01:00 UTC -> night (before 03:30 UTC sunrise)
    const earlyMorning = new Date('2026-09-09T04:00:00+03:00')
    expect(isDaylight(earlyMorning, helsinkiLat, helsinkiLon)).toBe(false)
  })

  it('identifies nearest past hour before playhead and keeps it visible on timeline', () => {

    // Generate 24 hourly points for 2026-09-13 (today)
    const points = Array.from({ length: 24 }, (_, h) => ({
      time: `2026-09-13T${h.toString().padStart(2, '0')}:00:00`,
      temperature: 12,
      symbol: 'rain-light' as const,
      precipitationMm: 0.1,
    }))

    // Scenario from user screenshot: playhead is at ~10:19 (619 minutes)
    const playheadMinutes = 10 * 60 + 19 // 619m

    const nearestPast = getNearestPastWeatherPoint(points, playheadMinutes)
    expect(nearestPast).not.toBeNull()
    expect(nearestPast?.time).toBe('2026-09-13T10:00:00')

    // 10:00 point visibility at 10:19 (isNearestPast = true, mutePastEvents = true)
    const point10 = getWeatherPointVisibility({
      pointTime: '2026-09-13T10:00:00',
      isToday: true,
      currentMinutes: playheadMinutes,
      isNearestPast: true,
      mutePastEvents: true,
    })
    expect(point10.isVisible).toBe(true)
    expect(point10.isMuted).toBe(false)

    // 09:00 point visibility at 10:19 (older past point, mutePastEvents = true -> hidden)
    const point09Hidden = getWeatherPointVisibility({
      pointTime: '2026-09-13T09:00:00',
      isToday: true,
      currentMinutes: playheadMinutes,
      isNearestPast: false,
      mutePastEvents: true,
    })
    expect(point09Hidden.isVisible).toBe(false)

    // 09:00 point visibility at 10:19 (older past point, mutePastEvents = false -> visible & muted)
    const point09Muted = getWeatherPointVisibility({
      pointTime: '2026-09-13T09:00:00',
      isToday: true,
      currentMinutes: playheadMinutes,
      isNearestPast: false,
      mutePastEvents: false,
    })
    expect(point09Muted.isVisible).toBe(true)
    expect(point09Muted.isMuted).toBe(true)

    // 11:00 point visibility at 10:19 (upcoming future point -> visible & active)
    const point11 = getWeatherPointVisibility({
      pointTime: '2026-09-13T11:00:00',
      isToday: true,
      currentMinutes: playheadMinutes,
      isNearestPast: false,
      mutePastEvents: true,
    })
    expect(point11.isVisible).toBe(true)
    expect(point11.isMuted).toBe(false)

    // Exact on-the-hour boundary test: at 10:00:00 (600m), nearest past is 10:00
    const onTheHour = getNearestPastWeatherPoint(points, 600)
    expect(onTheHour?.time).toBe('2026-09-13T10:00:00')

    // At 10:59:59 (659m), nearest past is still 10:00
    const endOfHour = getNearestPastWeatherPoint(points, 659)
    expect(endOfHour?.time).toBe('2026-09-13T10:00:00')

    // At 11:00:00 (660m), nearest past transitions cleanly to 11:00
    const nextHour = getNearestPastWeatherPoint(points, 660)
    expect(nextHour?.time).toBe('2026-09-13T11:00:00')
  })

  it('ensures only 1 past weather pill is visible behind playhead with 30-min timestep data', () => {

    // User screenshot scenario:
    // Playhead is at 16:23:12 (983 minutes)
    const playheadMinutes = 16 * 60 + 23 // 983m
    const playheadPercent = (playheadMinutes / 1440) * 100

    // Clustered bucket points for 14:00, 15:00, 16:00, 17:00, 18:00
    const clustered: { point: HourlyWeatherPoint; percent: number }[] = [
      {
        point: {
          time: '2026-09-13T14:00:00.000Z',
          temperature: 14,
          symbol: 'cloudy' as const,
          precipitationMm: 0,
        },
        percent: (14 / 24) * 100,
      },
      {
        point: {
          time: '2026-09-13T15:00:00.000Z',
          temperature: 12,
          symbol: 'partly-cloudy-day' as const,
          precipitationMm: 0,
        },
        percent: (15 / 24) * 100,
      },
      {
        point: {
          time: '2026-09-13T16:00:00.000Z',
          temperature: 12,
          symbol: 'rain-light' as const,
          precipitationMm: 0.2,
        },
        percent: (16 / 24) * 100,
      },
      {
        point: {
          time: '2026-09-13T17:00:00.000Z',
          temperature: 13,
          symbol: 'rain-light' as const,
          precipitationMm: 0.1,
        },
        percent: (17 / 24) * 100,
      },
      {
        point: {
          time: '2026-09-13T18:00:00.000Z',
          temperature: 13,
          symbol: 'cloudy' as const,
          precipitationMm: 0,
        },
        percent: (18 / 24) * 100,
      },
    ]

    // Nearest past weather point must be 16:00
    const nearestPast = getNearestPastWeatherPoint(clustered, playheadMinutes)
    expect(nearestPast).toBe(clustered[2].point)
    expect(nearestPast?.time).toBe('2026-09-13T16:00:00.000Z')

    // Determine visibility for all items
    const visibilities = clustered.map(({ point, percent }) => {
      const isNearestPast = nearestPast === point || point.time === nearestPast?.time
      return {
        pointTime: point.time,
        percent,
        isPast: percent <= playheadPercent,
        ...getWeatherPointVisibility({
          pointTime: point.time,
          percent,
          isToday: true,
          currentMinutes: playheadMinutes,
          isNearestPast,
          mutePastEvents: true,
        }),
      }
    })

    // 14:00 and 15:00 are behind playhead -> must be hidden (isVisible = false)
    expect(visibilities[0].isVisible).toBe(false)
    expect(visibilities[1].isVisible).toBe(false)

    // 16:00 is immediately behind playhead -> must be visible (isVisible = true)
    expect(visibilities[2].isVisible).toBe(true)
    expect(visibilities[2].isMuted).toBe(false)

    // 17:00 and 18:00 are ahead of playhead -> must be visible (isVisible = true)
    expect(visibilities[3].isVisible).toBe(true)
    expect(visibilities[4].isVisible).toBe(true)

    // Count visible points that are behind the playhead: EXACTLY 1!
    const visiblePastPoints = visibilities.filter((v) => v.isPast && v.isVisible)
    expect(visiblePastPoints.length).toBe(1)
    expect(visiblePastPoints[0].pointTime).toBe('2026-09-13T16:00:00.000Z')
  })

  it('dynamically scales precipitation bar height proportionally with rainfall amount', () => {
    // Zero or negative precipitation returns 0
    expect(calculatePrecipitationBarHeight(0)).toBe(0)
    expect(calculatePrecipitationBarHeight(-1)).toBe(0)

    // With default baseline anchor (1.5 mm):
    const h02 = calculatePrecipitationBarHeight(0.2)
    const h05 = calculatePrecipitationBarHeight(0.5)
    const h08 = calculatePrecipitationBarHeight(0.8)
    const h10 = calculatePrecipitationBarHeight(1.0)
    const h15 = calculatePrecipitationBarHeight(1.5)

    // Every higher rain amount must produce a strictly taller bar
    expect(h05).toBeGreaterThan(h02)
    expect(h08).toBeGreaterThan(h05)
    expect(h10).toBeGreaterThan(h08)
    expect(h15).toBeGreaterThan(h10)

    // Baseline minimum is visible (>= 15%) and peak reaches 100%
    expect(h02).toBeGreaterThanOrEqual(15)
    expect(h15).toBe(100)

    // When timeline has heavy rain peak (e.g. 5.0 mm):
    const hLightInHeavyDay = calculatePrecipitationBarHeight(0.5, 5.0)
    const hPeakInHeavyDay = calculatePrecipitationBarHeight(5.0, 5.0)
    expect(hPeakInHeavyDay).toBe(100)
    expect(hPeakInHeavyDay).toBeGreaterThan(hLightInHeavyDay)
  })

})
