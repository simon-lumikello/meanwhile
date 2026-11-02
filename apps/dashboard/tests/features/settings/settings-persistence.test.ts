import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import {
  loadDashboardConfig,
  saveDashboardConfig,
  exportConfigAsJson,
  importConfigFromJson,
  DEFAULT_CONFIG,
  type DashboardConfig,
} from '@dashboard/features/settings'
import { formatTimeLabel } from '@simon-lumikello/meanwhile-weather/core'
import { calculateAmbientState, isNightHour } from '@dashboard/components/ambient/ambientPolicy'

describe('Settings Persistence & Reload Verification', () => {
  let mockStorage: Record<string, string> = {}
  const originalLocalStorage = globalThis.localStorage

  beforeEach(() => {
    mockStorage = {}
    globalThis.localStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = String(value)
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        mockStorage = {}
      },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
      length: Object.keys(mockStorage).length,
    } as Storage
  })

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage
  })

  it('preserves 100% of non-default configuration fields across save and reload', () => {
    const nonDefaultConfig: DashboardConfig = {
      theme: 'light',
      orientation: 'vertical',
      mutePastEvents: false,
      clock24h: false,
      idleResetMinutes: 7,
      kioskMode: true,
      zebraStriping: false,
      gridLineIntensity: 'vivid',
      welcomeSeen: true,
      nightMode: {
        enabled: false,
        startHour: 20,
        endHour: 8,
        dimAfterLastEvent: false,
        dimAfterLastEventGraceSeconds: 45,
        dimAfterLastEventGraceMinutes: 2,
        backgroundDim: 45,
        cardDim: 25,
        auroraAlerts: false,
        showWeekAhead: true,
      },
      weatherMap: {
        showOnTimeline: false,
        showOnAmbient: false,
        size: 'compact',
        showAirplanes: false,
        zoom: 'wide',
        filterMode: 'rain',
        renderMode: 'radar-blocks',
        cloudTransparency: 'see-through',
        cloudLighting: 'noon',
      },
      swimlanes: [
        {
          id: 'custom-cal-1',
          title: 'Custom Calendar',
          enabled: false,
          type: 'google-calendar',
          icon: 'Briefcase',
          colorScheme: {
            primary: '#f43f5e',
            secondary: 'rgba(244, 63, 94, 0.16)',
            accent: '#fb7185',
            text: '#ffffff',
          },
          source: {
            endpoint: 'https://calendar.google.com/test.ics',
            refreshIntervalMinutes: 10,
          },
        },
        {
          id: 'custom-weather-1',
          title: 'Tampere Weather',
          enabled: true,
          type: 'weather',
          icon: 'CloudSun',
          colorScheme: {
            primary: '#06b6d4',
            secondary: 'rgba(6, 182, 212, 0.16)',
            accent: '#22d3ee',
            text: '#ffffff',
          },
          source: {
            endpoint: '',
            weatherProviderId: 'open-meteo',
            weatherLocation: 'Tampere',
            weatherLatitude: 61.4978,
            weatherLongitude: 23.761,
            refreshIntervalMinutes: 30,
            showRainAlerts: false,
          },
        },
      ],
    }

    saveDashboardConfig(nonDefaultConfig)

    // Simulate page reload
    const reloaded = loadDashboardConfig()

    expect(reloaded.theme).toBe('light')
    expect(reloaded.orientation).toBe('vertical')
    expect(reloaded.mutePastEvents).toBe(false)
    expect(reloaded.clock24h).toBe(false)
    expect(reloaded.idleResetMinutes).toBe(7)
    expect(reloaded.kioskMode).toBe(true)
    expect(reloaded.zebraStriping).toBe(false)
    expect(reloaded.gridLineIntensity).toBe('vivid')
    expect(reloaded.welcomeSeen).toBe(true)

    // Night mode fields
    expect(reloaded.nightMode.enabled).toBe(false)
    expect(reloaded.nightMode.startHour).toBe(20)
    expect(reloaded.nightMode.endHour).toBe(8)
    expect(reloaded.nightMode.dimAfterLastEvent).toBe(false)
    expect(reloaded.nightMode.dimAfterLastEventGraceSeconds).toBe(45)
    expect(reloaded.nightMode.dimAfterLastEventGraceMinutes).toBe(2)
    expect(reloaded.nightMode.backgroundDim).toBe(45)
    expect(reloaded.nightMode.cardDim).toBe(25)
    expect(reloaded.nightMode.auroraAlerts).toBe(false)
    expect(reloaded.nightMode.showWeekAhead).toBe(true)
    expect(DEFAULT_CONFIG.nightMode.showWeekAhead).toBe(false)

    expect(reloaded.weatherMap).toEqual(nonDefaultConfig.weatherMap)

    // Swimlanes
    expect(reloaded.swimlanes.length).toBe(2)
    expect(reloaded.swimlanes[0].id).toBe('custom-cal-1')
    expect(reloaded.swimlanes[0].title).toBe('Custom Calendar')
    expect(reloaded.swimlanes[0].enabled).toBe(false)
    expect(reloaded.swimlanes[0].icon).toBe('Briefcase')
    expect(reloaded.swimlanes[0].colorScheme.primary).toBe('#f43f5e')
    expect(reloaded.swimlanes[0].source.endpoint).toBe('https://calendar.google.com/test.ics')

    expect(reloaded.swimlanes[1].id).toBe('custom-weather-1')
    expect(reloaded.swimlanes[1].title).toBe('Tampere Weather')
    expect(reloaded.swimlanes[1].source.weatherLocation).toBe('Tampere')
    expect(reloaded.swimlanes[1].source.weatherLatitude).toBe(61.4978)
    expect(reloaded.swimlanes[1].source.showRainAlerts).toBe(false)
  })

  it('persists imported calendar contents across reload and private backup round trips', () => {
    const config: DashboardConfig = {
      ...DEFAULT_CONFIG,
      swimlanes: [{ ...DEFAULT_CONFIG.swimlanes.find(lane => lane.type === 'google-calendar')!, source: {
        endpoint: '', calendarSource: 'file', localCalendarFile: { name: 'family.ics', content: 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR' },
      } }],
    }
    expect(saveDashboardConfig(config)).toBe(true)
    expect(loadDashboardConfig().swimlanes).toEqual(config.swimlanes)
    expect(importConfigFromJson(exportConfigAsJson(config)).swimlanes).toEqual(config.swimlanes)
  })

  it('reports unavailable browser storage without overwriting the saved configuration', () => {
    saveDashboardConfig(DEFAULT_CONFIG)
    localStorage.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError') }
    expect(saveDashboardConfig({ ...DEFAULT_CONFIG, swimlanes: [] })).toBe(false)
    expect(loadDashboardConfig().swimlanes).toEqual(DEFAULT_CONFIG.swimlanes)
  })

  it('never clobbers false boolean settings with default true on next load', () => {
    const configWithFalses: DashboardConfig = {
      ...DEFAULT_CONFIG,
      mutePastEvents: false,
      clock24h: false,
      kioskMode: false,
      zebraStriping: false,
      welcomeSeen: false,
      nightMode: {
        ...DEFAULT_CONFIG.nightMode,
        enabled: false,
        dimAfterLastEvent: false,
        auroraAlerts: false,
      },
      weatherMap: {
        ...DEFAULT_CONFIG.weatherMap,
        showOnTimeline: false,
        showOnAmbient: false,
        showAirplanes: false,
      },
    }

    saveDashboardConfig(configWithFalses)
    const reloaded = loadDashboardConfig()

    expect(reloaded.mutePastEvents).toBe(false)
    expect(reloaded.clock24h).toBe(false)
    expect(reloaded.kioskMode).toBe(false)
    expect(reloaded.zebraStriping).toBe(false)
    expect(reloaded.welcomeSeen).toBe(false)
    expect(reloaded.nightMode.enabled).toBe(false)
    expect(reloaded.nightMode.dimAfterLastEvent).toBe(false)
    expect(reloaded.nightMode.auroraAlerts).toBe(false)
    expect(reloaded.weatherMap.showOnTimeline).toBe(false)
    expect(reloaded.weatherMap.showOnAmbient).toBe(false)
    expect(reloaded.weatherMap.showAirplanes).toBe(false)
  })

  it('keeps persisted zero values and fills in weather map fields missing from an older save', () => {
    mockStorage['family_dashboard_config_v1'] = JSON.stringify({
      ...DEFAULT_CONFIG,
      nightMode: {
        ...DEFAULT_CONFIG.nightMode,
        startHour: 0,
        backgroundDim: 0,
        cardDim: 0,
      },
      weatherMap: { zoom: 'local', renderMode: 'radar-blocks' },
    })

    const loaded = loadDashboardConfig()

    expect(loaded.nightMode).toMatchObject({ startHour: 0, backgroundDim: 0, cardDim: 0 })
    expect(loaded.weatherMap).toEqual({
      ...DEFAULT_CONFIG.weatherMap,
      zoom: 'local',
      renderMode: 'radar-blocks',
    })
  })

  it('fills in the default weather map when the saved config has none', () => {
    const { weatherMap: _omitted, ...withoutWeatherMap } = DEFAULT_CONFIG
    mockStorage['family_dashboard_config_v1'] = JSON.stringify(withoutWeatherMap)

    expect(loadDashboardConfig().weatherMap).toEqual(DEFAULT_CONFIG.weatherMap)
  })

  it('persists empty swimlanes array without reverting to default lanes on next load', () => {
    const configWithoutLanes: DashboardConfig = {
      ...DEFAULT_CONFIG,
      swimlanes: [],
    }

    saveDashboardConfig(configWithoutLanes)
    const reloaded = loadDashboardConfig()

    expect(Array.isArray(reloaded.swimlanes)).toBe(true)
    expect(reloaded.swimlanes.length).toBe(0)
  })

  it('faithfully exports and imports configuration without dropping any properties', () => {
    const original: DashboardConfig = {
      ...DEFAULT_CONFIG,
      theme: 'system',
      orientation: 'vertical',
      weatherMap: {
        ...DEFAULT_CONFIG.weatherMap,
        size: 'compact',
        filterMode: 'rain',
      },
    }

    const exportedJson = exportConfigAsJson(original)
    const imported = importConfigFromJson(exportedJson)

    expect(imported).toEqual(original)
  })

  describe('Settings Effect Verification on Application Behavior', () => {
    it('clock24h setting directly controls time label formatting across the dashboard', () => {
      const afternoonDate = new Date('2026-09-12T14:45:00')
      const midnightDate = new Date('2026-09-12T00:15:00')

      // When clock24h is true
      expect(formatTimeLabel(afternoonDate, true)).toBe('14:45')
      expect(formatTimeLabel(midnightDate, true)).toBe('00:15')

      // When clock24h is false (12-hour AM/PM format)
      expect(formatTimeLabel(afternoonDate, false)).toBe('2:45 PM')
      expect(formatTimeLabel(midnightDate, false)).toBe('12:15 AM')
    })

    it('dimAfterLastEvent setting directly controls daytime ambient screen activation', () => {
      const daytime = new Date(2026, 8, 12, 14, 0, 0)

      // When enabled: daytime with no events displays ambient weather cards
      const stateEnabled = calculateAmbientState({
        enabled: true,
        startHour: 23,
        endHour: 6,
        currentTime: daytime,
        dimAfterLastEvent: true,
        hasRemainingEvents: false,
      })
      expect(stateEnabled.shouldShow).toBe(true)
      expect(stateEnabled.isDimmed).toBe(false) // daytime full brightness

      // When disabled: daytime with no events remains on timeline grid
      const stateDisabled = calculateAmbientState({
        enabled: true,
        startHour: 23,
        endHour: 6,
        currentTime: daytime,
        dimAfterLastEvent: false,
        hasRemainingEvents: false,
      })
      expect(stateDisabled.shouldShow).toBe(false)
      expect(stateDisabled.isDimmed).toBe(false)
    })

    it('nightMode.enabled setting completely disables ambient mode and dimming when turned off', () => {
      const midnight = new Date(2026, 8, 12, 23, 30, 0)

      const stateDisabled = calculateAmbientState({
        enabled: false,
        startHour: 23,
        endHour: 6,
        currentTime: midnight,
        dimAfterLastEvent: true,
        hasRemainingEvents: false,
      })
      expect(stateDisabled.shouldShow).toBe(false)
      expect(stateDisabled.isDimmed).toBe(false)
    })

    it('nightMode.startHour and endHour adjust the nocturnal dimming window as configured', () => {
      // Custom schedule: 20:00 to 08:00
      expect(isNightHour(19, 20, 8)).toBe(false) // 19:00 is daytime
      expect(isNightHour(20, 20, 8)).toBe(true)  // 20:00 is night
      expect(isNightHour(7, 20, 8)).toBe(true)   // 07:00 is night
      expect(isNightHour(8, 20, 8)).toBe(false)  // 08:00 is daytime

      // Default schedule: 23:00 to 06:00
      expect(isNightHour(20, 23, 6)).toBe(false) // 20:00 was daytime under default
      expect(isNightHour(23, 23, 6)).toBe(true)
    })
  })
})
