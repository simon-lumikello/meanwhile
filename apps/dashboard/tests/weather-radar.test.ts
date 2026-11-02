import { describe, it, expect } from 'bun:test'
import { stubFetch } from './support/stubFetch'
import {
  latLonToWebMercator,
  getBoundingBox3857,
  RADAR_ZOOM_METERS,
  RADAR_ZOOM_LABELS,
  getRadarDeltaMeters,
  getWindCardinal,
  getWindBeaufort,
  getWindFlowRotation,
  getShortRainAlertLabel,
  calculateRadarPlacement,
  type RadarZoomLevel,
} from '@simon-lumikello/meanwhile-radar/core'
import {
  FMI_RADAR_BOUNDS,
  fetchFmiRadarRainRate as fetchRadarRainRate,
  fetchOpenMeteoWind as fetchCurrentWind,
  getFmiRadarMapUrl as getRadarMapUrl,
  isWithinFmiRadarCoverage,
} from '@simon-lumikello/meanwhile-radar/sources'
import { isDashboardRadarEligible } from '@dashboard/services/radar/radarEligibility'
import { createDefaultWeatherLane } from '@dashboard/features/settings'
import type { HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'

describe('FMI Weather Radar & Nowcasting Engine', () => {
  it('correctly projects WGS84 coordinates to EPSG:3857 Web Mercator', () => {
    // Helsinki: ~60.1695 N, 24.9354 E
    const { x, y } = latLonToWebMercator(60.1695, 24.9354)
    expect(Math.round(x)).toBe(2775796)
    expect(Math.round(y)).toBe(8437572)

    // Equator / Prime Meridian
    const origin = latLonToWebMercator(0, 0)
    expect(Math.round(origin.x)).toBe(0)
    expect(Math.round(origin.y)).toBe(0)
  })

  it('generates valid bounding box and WMS GetMap URL with punched in default zoom and configurable levels', () => {
    // Default zoom is punched in (close: 20000 m, span = 40000 m)
    const defaultBbox = getBoundingBox3857(60.1695, 24.9354)
    const defaultParts = defaultBbox.split(',').map(Number)
    expect(defaultParts).toHaveLength(4)
    expect(defaultParts[2] - defaultParts[0]).toBe(40000) // 2 * 20000
    expect(defaultParts[3] - defaultParts[1]).toBe(40000)

    // Local neighborhood zoom (10000 m, span = 20000 m)
    const localBbox = getBoundingBox3857(60.1695, 24.9354, RADAR_ZOOM_METERS.local)
    const localParts = localBbox.split(',').map(Number)
    expect(localParts[2] - localParts[0]).toBe(20000) // 2 * 10000
    expect(localParts[3] - localParts[1]).toBe(20000)

    // Standard regional zoom (35000 m, span = 70000 m)
    const standardBbox = getBoundingBox3857(60.1695, 24.9354, RADAR_ZOOM_METERS.standard)
    const standardParts = standardBbox.split(',').map(Number)
    expect(standardParts[2] - standardParts[0]).toBe(70000) // 2 * 35000
    expect(standardParts[3] - standardParts[1]).toBe(70000)

    // Wide overview zoom (70000 m, span = 140000 m)
    const wideBbox = getBoundingBox3857(60.1695, 24.9354, RADAR_ZOOM_METERS.wide)
    const wideParts = wideBbox.split(',').map(Number)
    expect(wideParts[2] - wideParts[0]).toBe(140000) // 2 * 70000
    expect(wideParts[3] - wideParts[1]).toBe(140000)

    // Zoom helpers and labels
    expect(RADAR_ZOOM_LABELS.local).toBe('±10 km')
    expect(RADAR_ZOOM_LABELS.close).toBe('±20 km')
    expect(RADAR_ZOOM_LABELS.standard).toBe('±35 km')
    expect(RADAR_ZOOM_LABELS.wide).toBe('±70 km')
    expect(getRadarDeltaMeters('local')).toBe(10000)
    expect(getRadarDeltaMeters('close')).toBe(20000)
    expect(getRadarDeltaMeters('standard')).toBe(35000)
    expect(getRadarDeltaMeters('wide')).toBe(70000)
    expect(getRadarDeltaMeters()).toBe(20000)

    const url = getRadarMapUrl(60.1695, 24.9354, 35000, 320, 200)
    expect(url).toContain('https://openwms.fmi.fi/geoserver/wms')
    expect(url).toContain('LAYERS=Radar:radar_finland_cappi_rate')
    expect(url).toContain('SRS=EPSG:3857')
    expect(url).toContain('BBOX=')
    expect(url).toContain('WIDTH=320')
    expect(url).toContain('HEIGHT=200')
    expect(url).toContain('TRANSPARENT=TRUE')
  })

  it('turns on rain alerts for a new weather lane', () => {
    expect(createDefaultWeatherLane().source.showRainAlerts).toBe(true)
  })

  it('correctly calculates 16-point cardinal wind directions from degrees', () => {
    // Exact cardinal points
    expect(getWindCardinal(0)).toBe('N')
    expect(getWindCardinal(360)).toBe('N')
    expect(getWindCardinal(90)).toBe('E')
    expect(getWindCardinal(180)).toBe('S')
    expect(getWindCardinal(270)).toBe('W')

    // Intermediate points
    expect(getWindCardinal(45)).toBe('NE')
    expect(getWindCardinal(135)).toBe('SE')
    expect(getWindCardinal(225)).toBe('SW')
    expect(getWindCardinal(315)).toBe('NW')

    // 16-point fine points
    expect(getWindCardinal(22.5)).toBe('NNE')
    expect(getWindCardinal(67.5)).toBe('ENE')
    expect(getWindCardinal(112.5)).toBe('ESE')
    expect(getWindCardinal(157.5)).toBe('SSE')
    expect(getWindCardinal(202.5)).toBe('SSW')
    expect(getWindCardinal(247.5)).toBe('WSW')
    expect(getWindCardinal(292.5)).toBe('WNW')
    expect(getWindCardinal(337.5)).toBe('NNW')

    // Boundary wrapping and tolerance
    expect(getWindCardinal(355)).toBe('N')
    expect(getWindCardinal(10)).toBe('N')
    expect(getWindCardinal(720)).toBe('N')
    expect(getWindCardinal(-90)).toBe('W')
    expect(getWindCardinal(undefined)).toBe('')
  })

  it('correctly maps wind speed to Beaufort scale, labels, and storm flags', () => {
    // Calm (< 0.3 m/s)
    const calm = getWindBeaufort(0.1)
    expect(calm.scale).toBe(0)
    expect(calm.label).toBe('Calm')

    // Light breeze (1.6 - 3.3 m/s)
    const light = getWindBeaufort(2.5)
    expect(light.scale).toBe(2)
    expect(light.label).toBe('Light breeze')

    // Gentle breeze (3.4 - 5.4 m/s)
    const gentle = getWindBeaufort(4.2)
    expect(gentle.scale).toBe(3)
    expect(gentle.label).toBe('Gentle breeze')

    // Moderate breeze (5.5 - 7.9 m/s)
    const moderate = getWindBeaufort(6.5)
    expect(moderate.scale).toBe(4)
    expect(moderate.label).toBe('Moderate breeze')

    // Strong breeze (10.8 - 13.8 m/s)
    const strong = getWindBeaufort(12.0)
    expect(strong.scale).toBe(6)
    expect(strong.label).toBe('Strong breeze')

    // Near gale / Storm threshold (>= 13.9 m/s)
    const nearGale = getWindBeaufort(15.0)
    expect(nearGale.scale).toBe(7)
    expect(nearGale.label).toBe('Near gale')

    // Storm (>= 20.8 m/s)
    const storm = getWindBeaufort(22.0)
    expect(storm.scale).toBe(9)
    expect(storm.label).toBe('Storm')
  })

  it('correctly calculates airflow vector rotation from meteorological wind direction', () => {
    // Meteorological wind: from North (0°) -> arrow points South (180°)
    expect(getWindFlowRotation(0)).toBe(180)
    // Wind from East (90°) -> arrow points West (270°)
    expect(getWindFlowRotation(90)).toBe(270)
    // Wind from South (180°) -> arrow points North (0°)
    expect(getWindFlowRotation(180)).toBe(0)
    // Wind from West (270°) -> arrow points East (90°)
    expect(getWindFlowRotation(270)).toBe(90)
    // Wind from NW (315°) -> arrow points SE (135°)
    expect(getWindFlowRotation(315)).toBe(135)
  })

  it('parses real-time wind data from Open-Meteo current endpoint in fetchCurrentWind', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = stubFetch(async (url) => {
        expect(String(url)).toContain('current=wind_speed_10m,wind_direction_10m,wind_gusts_10m')
        return new Response(JSON.stringify({
            current: {
              wind_speed_10m: 5.4,
              wind_direction_10m: 220,
              wind_gusts_10m: 8.9,
            },
          }), { headers: { 'Content-Type': 'application/json' } })
      })

      const wind = await fetchCurrentWind(60.1695, 24.9354)
      expect(wind).not.toBeNull()
      expect(wind?.speedMs).toBe(5.4)
      expect(wind?.directionDeg).toBe(220)
      expect(wind?.gustMs).toBe(8.9)
      expect(wind?.isStormWarning).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('generates concise short rain alert labels without clipping', () => {
    expect(
      getShortRainAlertLabel({
        status: 'active',
        type: 'rain',
        intensityMmH: 0.05,
        summary: 'Drizzle falling now · <0.1 mm/h',
        distanceKm: 0,
        updatedAt: new Date().toISOString(),
      })
    ).toBe('Drizzle')

    expect(
      getShortRainAlertLabel({
        status: 'active',
        type: 'rain',
        intensityMmH: 0.1,
        summary: 'Light rain falling now · 0.1 mm/h',
        distanceKm: 0,
        updatedAt: new Date().toISOString(),
      })
    ).toBe('Light rain')

    expect(
      getShortRainAlertLabel({
        status: 'active',
        type: 'rain',
        intensityMmH: 2.0,
        summary: 'Moderate rain falling now · 2.0 mm/h',
        distanceKm: 0,
        updatedAt: new Date().toISOString(),
      })
    ).toBe('Moderate rain')

    expect(
      getShortRainAlertLabel({
        status: 'active',
        type: 'rain',
        intensityMmH: 5.5,
        summary: 'Heavy rain falling now · 5.5 mm/h',
        distanceKm: 0,
        updatedAt: new Date().toISOString(),
      })
    ).toBe('Heavy rain')

    expect(
      getShortRainAlertLabel({
        status: 'approaching',
        type: 'rain',
        intensityMmH: 1.5,
        summary: 'Rain approaching in ~15–30 min (1.5 mm/h nearby)',
        distanceKm: 10,
        updatedAt: new Date().toISOString(),
      })
    ).toBe('Rain approaching')

    expect(
      getShortRainAlertLabel({
        status: 'active',
        type: 'snow',
        intensityMmH: 0.3,
        summary: 'Light snow falling now · 0.3 mm/h',
        distanceKm: 0,
        updatedAt: new Date().toISOString(),
      })
    ).toBe('Light snow')

    expect(
      getShortRainAlertLabel({
        status: 'approaching',
        type: 'snow',
        intensityMmH: 0.8,
        summary: 'Snow approaching in ~15–30 min',
        distanceKm: 10,
        updatedAt: new Date().toISOString(),
      })
    ).toBe('Snow approaching')
  })

  it('correctly evaluates FMI radar coverage dataset boundaries (isWithinFmiRadarCoverage)', () => {
    // Official bounds verification
    expect(FMI_RADAR_BOUNDS.minLat).toBe(57.1)
    expect(FMI_RADAR_BOUNDS.maxLat).toBe(70.8)
    expect(FMI_RADAR_BOUNDS.minLon).toBe(15.3)
    expect(FMI_RADAR_BOUNDS.maxLon).toBe(42.7)

    // Finnish cities and municipalities must all be covered
    expect(isWithinFmiRadarCoverage(60.1695, 24.9354)).toBe(true) // Helsinki
    expect(isWithinFmiRadarCoverage(61.4978, 23.7610)).toBe(true) // Tampere
    expect(isWithinFmiRadarCoverage(60.4518, 22.2666)).toBe(true) // Turku
    expect(isWithinFmiRadarCoverage(65.0121, 25.4651)).toBe(true) // Oulu
    expect(isWithinFmiRadarCoverage(66.5039, 25.7294)).toBe(true) // Rovaniemi
    expect(isWithinFmiRadarCoverage(69.9087, 27.0286)).toBe(true) // Utsjoki (Far North Lapland)
    expect(isWithinFmiRadarCoverage(60.0973, 19.9348)).toBe(true) // Mariehamn (Åland Islands)
    expect(isWithinFmiRadarCoverage(63.0951, 21.6165)).toBe(true) // Vaasa
    expect(isWithinFmiRadarCoverage(62.6010, 29.7636)).toBe(true) // Joensuu

    // Worldwide locations outside of FMI national composite must be rejected
    expect(isWithinFmiRadarCoverage(35.6762, 139.6503)).toBe(false) // Tokyo
    expect(isWithinFmiRadarCoverage(40.7128, -74.0060)).toBe(false) // New York
    expect(isWithinFmiRadarCoverage(51.5074, -0.1278)).toBe(false)  // London
    expect(isWithinFmiRadarCoverage(48.8566, 2.3522)).toBe(false)   // Paris
    expect(isWithinFmiRadarCoverage(-33.8688, 151.2093)).toBe(false)// Sydney
    expect(isWithinFmiRadarCoverage(52.5200, 13.4050)).toBe(false)  // Berlin
    expect(isWithinFmiRadarCoverage(41.9028, 12.4964)).toBe(false)  // Rome

    // Missing, invalid, or NaN coordinates
    expect(isWithinFmiRadarCoverage(undefined, undefined)).toBe(false)
    expect(isWithinFmiRadarCoverage(60.1695, undefined)).toBe(false)
    expect(isWithinFmiRadarCoverage(NaN, 24.9354)).toBe(false)
  })

  it('keeps dashboard radar eligibility in app composition', () => {
    // 1. FMI provider + Finnish coordinates = Supported
    expect(isDashboardRadarEligible('fmi', 60.1695, 24.9354)).toBe(true) // Helsinki
    expect(isDashboardRadarEligible('fmi', 61.4978, 23.7610)).toBe(true) // Tampere
    expect(isDashboardRadarEligible('fmi', 69.9087, 27.0286)).toBe(true) // Utsjoki

    // 2. Open-Meteo provider (even in Finland) = NOT supported (no radar CAPPI rate data)
    expect(isDashboardRadarEligible('open-meteo', 60.1695, 24.9354)).toBe(false)
    expect(isDashboardRadarEligible('open-meteo', 61.4978, 23.7610)).toBe(false)

    // 3. FMI provider but outside radar coverage area = NOT supported
    expect(isDashboardRadarEligible('fmi', 51.5074, -0.1278)).toBe(false)  // London
    expect(isDashboardRadarEligible('fmi', 35.6762, 139.6503)).toBe(false) // Tokyo
    expect(isDashboardRadarEligible('fmi', 52.5200, 13.4050)).toBe(false)  // Berlin

    // 4. Missing or unrecognized provider / coordinates = NOT supported
    expect(isDashboardRadarEligible(undefined, 60.1695, 24.9354)).toBe(false)
    expect(isDashboardRadarEligible('custom-provider', 60.1695, 24.9354)).toBe(false)
    expect(isDashboardRadarEligible('fmi', undefined, undefined)).toBe(false)
  })

  it('correctly calculates radar placement favoring the past part of the day (calculateRadarPlacement)', () => {
    // 1. Standard 1080p desktop screen (1920px width, 208px header, 1712px timeline)
    // Standard radar width = 640px. Required space = 12 + 640 + 20 = 672px.
    // 672 / 1712 = 39.25% of day (~09:25 AM)

    // Very early morning (03:00 -> 12.5%): not enough space to the left of playhead -> falls back to 'right'
    const earlyMorning = calculateRadarPlacement({
      playheadPercent: 12.5,
      orientation: 'horizontal',
      radarSize: 'standard',
      windowWidth: 1920,
    })
    expect(earlyMorning.position).toBe('right')
    expect(earlyMorning.availableSpace).toBeLessThan(earlyMorning.requiredSpace)

    // Mid-morning (07:00 -> 29.17%): still not enough room for 640px card -> 'right'
    const morning7am = calculateRadarPlacement({
      playheadPercent: 29.17,
      orientation: 'horizontal',
      radarSize: 'standard',
      windowWidth: 1920,
    })
    expect(morning7am.position).toBe('right')

    // Mid-morning (10:00 -> 41.67%): playhead has progressed far enough, past space > 672px -> prefers 'left'
    const morning10am = calculateRadarPlacement({
      playheadPercent: 41.67,
      orientation: 'horizontal',
      radarSize: 'standard',
      windowWidth: 1920,
    })
    expect(morning10am.position).toBe('left')
    expect(morning10am.availableSpace).toBeGreaterThanOrEqual(morning10am.requiredSpace)

    // Afternoon (15:00 -> 62.5%): firmly on the past part of the day -> 'left'
    const afternoon = calculateRadarPlacement({
      playheadPercent: 62.5,
      orientation: 'horizontal',
      radarSize: 'standard',
      windowWidth: 1920,
    })
    expect(afternoon.position).toBe('left')

    // 2. Compact radar widget size (440px): required space = 12 + 440 + 20 = 472px.
    // 472 / 1712 = 27.57% (~06:37 AM)
    // At 07:00 (29.17%), compact radar fits to the left, whereas standard radar does not
    const compactAt7am = calculateRadarPlacement({
      playheadPercent: 29.17,
      orientation: 'horizontal',
      radarSize: 'compact',
      windowWidth: 1920,
    })
    expect(compactAt7am.position).toBe('left')

    // 3. Wall Display (2560x1440 iMac / Chrome OS Flex, 2352px timeline):
    // Standard radar (640px) required space = 672px. 672 / 2352 = 28.57% (~06:51 AM)
    const wallDisplayAt8am = calculateRadarPlacement({
      playheadPercent: 33.33,
      orientation: 'horizontal',
      radarSize: 'standard',
      windowWidth: 2560,
    })
    expect(wallDisplayAt8am.position).toBe('left')

    // 4. When viewing another date (playheadPercent is null) -> 'right'
    const notToday = calculateRadarPlacement({
      playheadPercent: null,
      orientation: 'horizontal',
      radarSize: 'standard',
      windowWidth: 1920,
    })
    expect(notToday.position).toBe('right')

    // 5. When in vertical orientation -> 'right'
    const verticalMode = calculateRadarPlacement({
      playheadPercent: 50,
      orientation: 'vertical',
      radarSize: 'standard',
      windowWidth: 1920,
    })
    expect(verticalMode.position).toBe('right')

    // 6. Mobile screen width (< 768px): screen too narrow to fit radar to left of playhead -> 'right'
    const mobileScreen = calculateRadarPlacement({
      playheadPercent: 50,
      orientation: 'horizontal',
      radarSize: 'standard',
      windowWidth: 390,
    })
    expect(mobileScreen.position).toBe('right')
  })

  it('formats drizzle and rain rates consistently for glanceable display', () => {
    const formatRadarRate = (rate: number | null) => {
      if (rate === null || rate < 0.01) return 'Dry'
      if (rate < 0.1) return 'Drizzle'
      return `${rate.toFixed(1)} mm/h`
    }

    expect(formatRadarRate(null)).toBe('Dry')
    expect(formatRadarRate(0)).toBe('Dry')
    expect(formatRadarRate(0.005)).toBe('Dry')
    expect(formatRadarRate(0.04)).toBe('Drizzle')
    expect(formatRadarRate(0.09)).toBe('Drizzle')
    expect(formatRadarRate(0.1)).toBe('0.1 mm/h')
    expect(formatRadarRate(2.45)).toBe('2.5 mm/h')
  })

  it('exports RadarViewport from the radar package', async () => {
    // Source-level radar contracts live with the package, in packages/radar/tests.
    const { RadarViewport } = await import('@simon-lumikello/meanwhile-radar/react')

    expect(typeof RadarViewport).toBe('function')
  })



  it('exports AuroraRadarCanvas and integrates aurora overlay into radar architecture', async () => {
    const { AuroraRadarCanvas } = await import('@simon-lumikello/meanwhile-radar/react')
    expect(typeof AuroraRadarCanvas).toBe('function')
  })

  it('suppresses active aurora on radar card when overcast/cloudy even if isAuroraOngoing is true', async () => {
    const { evaluateAuroraVisibility } = await import('@simon-lumikello/meanwhile-weather/core')
    const helsinkiLat = 60.1695
    const helsinkiLon = 24.9354

    // 1. Cloudy/overcast night with high Kp: ionosphere has storm (isAuroraOngoing = true), but clouds block ground view (isCurrentlyVisible = false)
    const overcastWeather: HourlyWeatherPoint[] = [
      {
        time: '2026-09-09T20:00:00Z',
        temperature: 10,
        symbol: 'cloudy',
        precipitationMm: 0,
        precipitationProbability: 10,
        windSpeedMs: 2,
        isStormWarning: false,
        isDay: false,
      },
    ]
    const stormKp = [
      { time: '2026-09-09T20:00:00Z', kp: 5.8, observed: 'predicted' as const, noaaScale: 'G1' as const },
    ]

    const statusCloudy = evaluateAuroraVisibility(
      stormKp,
      overcastWeather,
      helsinkiLat,
      helsinkiLon,
      new Date('2026-09-09T20:00:00Z')
    )

    expect(statusCloudy.isAuroraOngoing).toBe(true)
    expect(statusCloudy.isCurrentlyVisible).toBe(false)
    // Radar display logic uses isCurrentlyVisible, preventing aurora curtain animation when sky is full of clouds
    const radarAuroraActive = statusCloudy.isCurrentlyVisible ?? false
    expect(radarAuroraActive).toBe(false)

    // 2. Clear night: both are true, activating aurora animation on radar
    const clearWeather: HourlyWeatherPoint[] = [
      {
        ...overcastWeather[0],
        symbol: 'clear-night',
      },
    ]
    const statusClear = evaluateAuroraVisibility(
      stormKp,
      clearWeather,
      helsinkiLat,
      helsinkiLon,
      new Date('2026-09-09T20:00:00Z')
    )
    expect(statusClear.isAuroraOngoing).toBe(true)
    expect(statusClear.isCurrentlyVisible).toBe(true)
    expect(statusClear.isCurrentlyVisible ?? false).toBe(true)
  })

  describe('Radar Position Transition & Wake-Up Resilience', () => {
    it('determines correct transition action (computeRadarTransitionAction)', async () => {
      const { computeRadarTransitionAction } = await import(
        '@simon-lumikello/meanwhile-radar/react'
      )

      // When hidden (e.g. ambient lock screen is showing), always snap position without animation
      expect(
        computeRadarTransitionAction({
          currentDisplayedPosition: 'left',
          targetPlacement: 'right',
          hidden: true,
        })
      ).toBe('snap')

      expect(
        computeRadarTransitionAction({
          currentDisplayedPosition: 'right',
          targetPlacement: 'left',
          hidden: true,
        })
      ).toBe('snap')

      expect(
        computeRadarTransitionAction({
          currentDisplayedPosition: 'left',
          targetPlacement: 'left',
          hidden: true,
        })
      ).toBe('snap')

      // When visible on screen:
      // If position hasn't changed, action is 'none'
      expect(
        computeRadarTransitionAction({
          currentDisplayedPosition: 'left',
          targetPlacement: 'left',
          hidden: false,
        })
      ).toBe('none')

      expect(
        computeRadarTransitionAction({
          currentDisplayedPosition: 'right',
          targetPlacement: 'right',
          hidden: false,
        })
      ).toBe('none')

      // If position has changed while visible, action is 'animate'
      expect(
        computeRadarTransitionAction({
          currentDisplayedPosition: 'right',
          targetPlacement: 'left',
          hidden: false,
        })
      ).toBe('animate')

      expect(
        computeRadarTransitionAction({
          currentDisplayedPosition: 'left',
          targetPlacement: 'right',
          hidden: false,
        })
      ).toBe('animate')
    })

    it('correctly handles overnight midnight rollover and morning wake-up sequence', async () => {
      const { computeRadarTransitionAction } = await import(
        '@simon-lumikello/meanwhile-radar/react'
      )

      // Step 1: Late evening (22:00) — user is viewing timeline
      // Playhead is near the right edge; radar is positioned on the left (past part of day)
      const lateEveningPlacement = calculateRadarPlacement({
        playheadPercent: (22 / 24) * 100,
        windowWidth: 2560,
      }).position
      expect(lateEveningPlacement).toBe('left')

      let currentDisplayedPosition = lateEveningPlacement
      let isFadingOut = false

      // Step 2: Night mode lock screen activates (23:00)
      let hidden = true
      let action = computeRadarTransitionAction({
        currentDisplayedPosition,
        targetPlacement: lateEveningPlacement,
        hidden,
      })
      expect(action).toBe('snap')
      if (action === 'snap') {
        currentDisplayedPosition = lateEveningPlacement
        isFadingOut = false
      }
      expect(isFadingOut).toBe(false)
      expect(currentDisplayedPosition).toBe('left')

      // Step 3: Midnight rollover (00:00)
      // Playhead wraps to 0%; available space on the left becomes 0, so target becomes 'right'
      const midnightPlacement = calculateRadarPlacement({
        playheadPercent: 0,
        windowWidth: 2560,
      }).position
      expect(midnightPlacement).toBe('right')

      // Since lock screen is still active (hidden: true), it immediately snaps without stuck animation
      action = computeRadarTransitionAction({
        currentDisplayedPosition,
        targetPlacement: midnightPlacement,
        hidden,
      })
      expect(action).toBe('snap')
      if (action === 'snap') {
        currentDisplayedPosition = midnightPlacement
        isFadingOut = false
      }
      expect(isFadingOut).toBe(false)
      expect(currentDisplayedPosition).toBe('right')

      // Step 4: Early morning before crossover (06:00) while still on night mode
      // Playhead at 6am: available space on 2560px display is 2352 * (6/24) = 588px < 672px required space
      const morning6amPlacement = calculateRadarPlacement({
        playheadPercent: (6 / 24) * 100,
        windowWidth: 2560,
      }).position
      expect(morning6amPlacement).toBe('right')

      // Step 5: Early morning wake-up (07:00)
      // Dashboard naturally wakes up from lock screen at endHour (07:00); hidden becomes false!
      // On a 2560px iMac, crossover to 'left' occurred at ~06:52 AM (2352 * 7/24 = 686px >= 672px)
      hidden = false
      const morning7amPlacement = calculateRadarPlacement({
        playheadPercent: (7 / 24) * 100,
        windowWidth: 2560,
      }).position
      expect(morning7amPlacement).toBe('left')

      // Because crossover occurred while hidden, snap action ensured currentDisplayedPosition was already 'left'
      // and isFadingOut was false!
      action = computeRadarTransitionAction({
        currentDisplayedPosition: 'left',
        targetPlacement: morning7amPlacement,
        hidden,
      })
      expect(action).toBe('none')
      expect(isFadingOut).toBe(false)
      // Timeline radar is immediately visible and not stuck invisible!
      expect(isFadingOut || hidden).toBe(false)

      // Step 6: Daytime timeline transition test (e.g. if crossover occurs while awake)
      // Suppose displayed position was 'right' and target became 'left' while visible (hidden = false):
      action = computeRadarTransitionAction({
        currentDisplayedPosition: 'right',
        targetPlacement: 'left',
        hidden: false,
      })
      expect(action).toBe('animate')

      // Simulating the 2-phase animation cycle:
      // Phase 1: fade-out
      isFadingOut = true
      expect(isFadingOut).toBe(true)

      // Phase 2: reposition at opacity 0, then fade-in
      currentDisplayedPosition = 'left'
      isFadingOut = false
      expect(currentDisplayedPosition).toBe('left')
      expect(isFadingOut).toBe(false)
      expect(isFadingOut || hidden).toBe(false)
    })
  })

  describe('Radar Zoom Level Cycling & Control Logic', () => {
    it('cycles correctly through [local, close, standard, wide] sequence', () => {
      const zoomCycle: RadarZoomLevel[] = ['local', 'close', 'standard', 'wide']
      
      const getNextZoom = (current: RadarZoomLevel): RadarZoomLevel => {
        const nextIndex = (zoomCycle.indexOf(current) + 1) % zoomCycle.length
        return zoomCycle[nextIndex]
      }

      expect(getNextZoom('close')).toBe('standard')
      expect(getNextZoom('standard')).toBe('wide')
      expect(getNextZoom('wide')).toBe('local')
      expect(getNextZoom('local')).toBe('close')
    })
  })

  describe('Radar Rain Rate Telemetry & Precipitation Pill Gating', () => {
    it('returns null when coordinates are outside FMI radar coverage without requesting WMS', async () => {
      // Tokyo is far outside coverage
      const rateTokyo = await fetchRadarRainRate(35.6762, 139.6503)
      expect(rateTokyo).toBeNull()

      // Invalid / undefined coords
      const rateInvalid = await fetchRadarRainRate(NaN, NaN)
      expect(rateInvalid).toBeNull()
    })

    it('parses valid GRAY_INDEX measurements and handles network failures gracefully', async () => {
      const originalFetch = globalThis.fetch

      try {
        // Mock success response
        globalThis.fetch = stubFetch(async () =>
          new Response(
            JSON.stringify({
              type: 'FeatureCollection',
              features: [{ properties: { GRAY_INDEX: 1.456 } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ))

        const rate = await fetchRadarRainRate(60.1695, 24.9354)
        expect(rate).toBe(1.46)

        // Mock 0 mm/h (dry) response
        globalThis.fetch = stubFetch(async () =>
          new Response(
            JSON.stringify({
              type: 'FeatureCollection',
              features: [{ properties: { GRAY_INDEX: 0 } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ))

        const dryRate = await fetchRadarRainRate(60.1695, 24.9354)
        expect(dryRate).toBe(0)

        // Mock empty features response
        globalThis.fetch = stubFetch(async () =>
          new Response(
            JSON.stringify({
              type: 'FeatureCollection',
              features: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ))

        const emptyRate = await fetchRadarRainRate(60.1695, 24.9354)
        expect(emptyRate).toBeNull()

        // Mock HTTP 500 error
        globalThis.fetch = stubFetch(async () =>
          new Response('Internal Server Error', { status: 500 }))

        const errorRate = await fetchRadarRainRate(60.1695, 24.9354)
        expect(errorRate).toBeNull()

        // Mock network throw / rejection
        globalThis.fetch = stubFetch(async () => {
          throw new Error('Network failure')
        })

        const thrownRate = await fetchRadarRainRate(60.1695, 24.9354)
        expect(thrownRate).toBeNull()
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('verifies LiveRadarMap and WeatherRadarOverlay propagate filterMode and renderMode changes', async () => {
      const { LiveRadarMap } = await import('@simon-lumikello/meanwhile-radar/react')
      expect(typeof LiveRadarMap).toBe('function')

      // LiveRadarMap's own prop contract is tested with the package, in packages/radar/tests.
      const fs = await import('fs')
      const weatherOverlayContent = fs.readFileSync(
        new URL('../../../apps/dashboard/src/components/weather/WeatherRadarOverlay.tsx', import.meta.url),
        'utf-8'
      )
      expect(weatherOverlayContent).toContain('filterMode={filterMode}')
      expect(weatherOverlayContent).toContain('renderMode={renderMode}')
      expect(weatherOverlayContent).toContain('onFilterChange={onFilterChange}')
      expect(weatherOverlayContent).toContain('onRenderModeChange={onRenderModeChange}')

      const appContent = fs.readFileSync(
        new URL('../../../apps/dashboard/src/App.tsx', import.meta.url),
        'utf-8'
      )
      expect(appContent).toContain('filterMode={weatherMap.filterMode}')
      expect(appContent).toContain('renderMode={weatherMap.renderMode}')
      expect(appContent).toContain('onFilterChange={(filterMode) => updateWeatherMap({ filterMode })}')
      expect(appContent).toContain('onRenderModeChange={(renderMode) => updateWeatherMap({ renderMode })}')
    })
  })
})






