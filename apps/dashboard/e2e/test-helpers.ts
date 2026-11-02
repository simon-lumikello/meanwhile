import { expect, test as base, type Page } from '@playwright/test'
import type { DashboardConfig, SwimlaneConfig } from '../src/features/settings'

export { expect }

const EMPTY_LIGHTNING_RESPONSE = '<?xml version="1.0" encoding="UTF-8"?><wfs:FeatureCollection />'
const FMI_FORECAST_RESPONSE = ['2026-09-21T10:00:00Z', '2026-09-21T11:00:00Z', '2026-09-22T10:00:00Z']
  .flatMap(time =>
    [
      ['Temperature', '12'],
      ['WeatherSymbol3', '2'],
      ['Precipitation1h', '0'],
      ['WindSpeedMS', '3'],
      ['WindDirection', '180'],
    ].map(([parameter, value]) => ['<BsWfs:BsWfsElement>', `<BsWfs:Time>${time}</BsWfs:Time>`, `<BsWfs:ParameterName>${parameter}</BsWfs:ParameterName>`, `<BsWfs:ParameterValue>${value}</BsWfs:ParameterValue>`, '</BsWfs:BsWfsElement>'].join('')),
  )
  .join('')
const CALENDAR_FIXTURE = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:fixture-planning', 'DTSTART:20260921T130000', 'DTEND:20260921T140000', 'SUMMARY:Fixture planning', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
const TRANSPARENT_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL5VQAAAABJRU5ErkJggg==', 'base64')

async function installDashboardFixtures(page: Page) {
  const unexpectedRequests: string[] = []

  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url())

    if (requestUrl.pathname === '/api/ical-proxy') {
      await route.fulfill({ contentType: 'text/calendar', body: CALENDAR_FIXTURE })
      return
    }

    if (requestUrl.pathname === '/api/adsb-proxy') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ aircraft: [] }) })
      return
    }

    if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
      await route.continue()
      return
    }

    if (requestUrl.hostname === 'opendata.fmi.fi') {
      await route.fulfill({
        contentType: 'application/xml',
        body: requestUrl.searchParams.get('storedquery_id')?.includes('lightning') ? EMPTY_LIGHTNING_RESPONSE : FMI_FORECAST_RESPONSE,
      })
      return
    }

    if (requestUrl.hostname === 'openwms.fmi.fi') {
      if (requestUrl.searchParams.get('REQUEST') === 'GetFeatureInfo') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [] }) })
      } else {
        await route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG })
      }
      return
    }

    if (requestUrl.hostname === 'api.open-meteo.com') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ current: { wind_speed_10m: 3, wind_direction_10m: 180, wind_gusts_10m: 5 } }),
      })
      return
    }

    if (requestUrl.hostname === 'geocoding-api.open-meteo.com') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ results: [{ name: 'Tampere', country: 'Finland', admin1: 'Pirkanmaa', latitude: 61.4978, longitude: 23.761 }] }),
      })
      return
    }

    if (requestUrl.hostname === 'services.swpc.noaa.gov') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{ time_tag: '2026-09-21 00:00:00', kp: '2.0', observed: 'predicted', noaa_scale: null }]),
      })
      return
    }

    if (requestUrl.hostname === 'fonts.googleapis.com') {
      await route.fulfill({ contentType: 'text/css', body: '' })
      return
    }

    if (requestUrl.hostname === 'server.arcgisonline.com' || requestUrl.hostname === 'tile.openstreetmap.org') {
      await route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG })
      return
    }

    unexpectedRequests.push(requestUrl.href)
    await route.abort('failed')
  })

  return () => expect(unexpectedRequests, 'Unexpected external browser requests').toEqual([])
}

export const test = base.extend<{ dashboardFixtures: void }>({
  dashboardFixtures: [
    async ({ page }, use) => {
      await page.clock.setFixedTime(new Date('2026-09-21T13:05:06+03:00'))
      const assertNoUnexpectedRequests = await installDashboardFixtures(page)
      await use()
      assertNoUnexpectedRequests()
    },
    { auto: true },
  ],
})

type DashboardConfigOverrides = Partial<Omit<DashboardConfig, 'nightMode' | 'weatherMap'>> & {
  nightMode?: Partial<DashboardConfig['nightMode']>
  weatherMap?: Partial<DashboardConfig['weatherMap']>
}

/** A stored config to seed: the settings the tests rely on; the app fills in the rest from its defaults. */
export function createBaseConfig(overrides: DashboardConfigOverrides = {}) {
  const { nightMode: nightModeOverrides, weatherMap: weatherMapOverrides, ...topLevelOverrides } = overrides

  return {
    theme: 'dark',
    welcomeSeen: true,
    clock24h: true,
    kioskMode: false,
    orientation: 'horizontal',
    nightMode: {
      enabled: false,
      startHour: 21,
      endHour: 7,
      dimAfterLastEvent: true,
      backgroundDim: 80,
      cardDim: 70,
      ...(nightModeOverrides || {}),
    },
    weatherMap: {
      showOnTimeline: true,
      showOnAmbient: true,
      size: 'standard',
      showAirplanes: true,
      zoom: 'close',
      filterMode: 'clouds',
      // The realistic-clouds renderer runs on software WebGL in headless Chromium and saturates the
      // main thread (~15x slower tests). Functional tests don't assert on cloud rendering; that is
      // covered by the radar library's visual suite (packages/radar/e2e/cloud-rendering.spec.ts).
      renderMode: 'radar-blocks',
      cloudTransparency: 'solid',
      cloudLighting: 'time-of-day',
      ...(weatherMapOverrides || {}),
    },
    swimlanes: [
      {
        id: 'lane-weather',
        title: 'Weather',
        enabled: true,
        type: 'weather',
        icon: 'CloudSun',
        colorScheme: {
          primary: '#38bdf8',
          secondary: 'rgba(56, 189, 248, 0.12)',
          accent: '#7dd3fc',
          text: '#f0f9ff',
        },
        source: {
          endpoint: '',
          weatherProviderId: 'fmi',
          weatherLocation: 'Helsinki',
          weatherLatitude: 60.1695,
          weatherLongitude: 24.9354,
          weatherLocationMode: 'manual',
          manualLocation: {
            name: 'Helsinki',
            latitude: 60.1695,
            longitude: 24.9354,
          },
          refreshIntervalMinutes: 15,
          showRainAlerts: true,
        },
      },
      {
        id: 'lane-dad',
        title: 'Dad',
        enabled: true,
        type: 'google-calendar',
        icon: 'User',
        colorScheme: {
          primary: '#3b82f6',
          secondary: 'rgba(59, 130, 246, 0.12)',
          accent: '#60a5fa',
          text: '#eff6ff',
        },
        source: {
          endpoint: '',
        },
      },
      {
        id: 'lane-family',
        title: 'Family',
        enabled: true,
        type: 'google-calendar',
        icon: 'Users',
        colorScheme: {
          primary: '#10b981',
          secondary: 'rgba(16, 185, 129, 0.12)',
          accent: '#34d399',
          text: '#ecfdf5',
        },
        source: {
          endpoint: '',
        },
      },
    ] satisfies SwimlaneConfig[],
    ...topLevelOverrides,
  }
}

export async function seedDashboardConfig(page: Page, overrides: DashboardConfigOverrides = {}) {
  const config = createBaseConfig(overrides)
  await page.addInitScript(cfg => {
    try {
      if (!window.sessionStorage.getItem('__dashboard_seeded')) {
        window.localStorage.setItem('family_dashboard_config_v1', JSON.stringify(cfg))
        window.sessionStorage.setItem('__dashboard_seeded', 'true')
      }
    } catch {
      window.localStorage.setItem('family_dashboard_config_v1', JSON.stringify(cfg))
    }
  }, config)
}
