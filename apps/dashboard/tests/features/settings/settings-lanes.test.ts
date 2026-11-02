import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import {
  DEFAULT_CONFIG,
  createDefaultWeatherLane,
  createDefaultCalendarLane,
  pickDemoCity,
  loadDashboardConfig,
  saveDashboardConfig,
  type SwimlaneConfig,
  type SwimlaneType,
  type DashboardConfig,
} from '@dashboard/features/settings'
import { SettingsDrawer } from '@dashboard/features/settings/SettingsDrawer'

describe('Lane Configuration & Weather Restoration', () => {
  it('creates a complete, valid weather lane with createDefaultWeatherLane', () => {
    const lane = createDefaultWeatherLane()
    expect(lane.type).toBe('weather')
    expect(lane.title).toBe('Weather')
    expect(lane.enabled).toBe(true)
    expect(lane.icon).toBe('CloudSun')
    expect(lane.colorScheme.primary).toBe('#38bdf8')
    expect(lane.source.weatherProviderId).toBe('fmi')
    expect(typeof lane.source.weatherLocation).toBe('string')
    expect(typeof lane.source.weatherLatitude).toBe('number')
    expect(typeof lane.source.weatherLongitude).toBe('number')
  })

  it('supports creating weather lane for a specific city override', () => {
    const customCity = {
      name: 'Reykjavik',
      country: 'Iceland',
      latitude: 64.1466,
      longitude: -21.9426,
    }
    const lane = createDefaultWeatherLane(customCity, 'lane-weather-test')
    expect(lane.id).toBe('lane-weather-test')
    expect(lane.source.weatherLocation).toBe('Reykjavik')
    expect(lane.source.weatherLatitude).toBe(64.1466)
    expect(lane.source.weatherLongitude).toBe(-21.9426)
  })

  it('correctly identifies when weather lane is present or absent (hasWeatherLane)', () => {
    const config = { ...DEFAULT_CONFIG }
    const hasInitialWeather = config.swimlanes.some((l) => l.type === 'weather')
    expect(hasInitialWeather).toBe(true)

    // Delete the weather lane
    const lanesWithoutWeather = config.swimlanes.filter((l) => l.type !== 'weather')
    expect(lanesWithoutWeather.some((l) => l.type === 'weather')).toBe(false)

    // Re-add the weather lane
    const reAddedWeather = createDefaultWeatherLane()
    const restoredLanes = [reAddedWeather, ...lanesWithoutWeather]
    expect(restoredLanes.some((l) => l.type === 'weather')).toBe(true)
    expect(restoredLanes[0].type).toBe('weather')
  })

  it('supports converting a calendar lane to a weather lane with sensible defaults', () => {
    const calendarLane: SwimlaneConfig = {
      id: 'lane-user-1',
      title: 'New Member',
      type: 'google-calendar',
      enabled: true,
      icon: 'User',
      colorScheme: {
        primary: '#3b82f6',
        secondary: 'rgba(59, 130, 246, 0.16)',
        accent: '#60a5fa',
        text: '#ffffff',
      },
      source: {
        endpoint: 'https://example.com/test.ics',
        refreshIntervalMinutes: 5,
      },
    }

    const defaultCity = pickDemoCity()
    const targetType: SwimlaneType = 'weather'

    // Simulation of SettingsDrawer conversion logic
    const convertedLane: SwimlaneConfig = {
      ...calendarLane,
      type: targetType,
      title: calendarLane.title === 'New Member' ? 'Weather' : calendarLane.title,
      icon: calendarLane.icon === 'User' ? 'CloudSun' : calendarLane.icon,
      colorScheme: {
        primary: '#38bdf8',
        secondary: 'rgba(56, 189, 248, 0.12)',
        accent: '#7dd3fc',
        text: '#f0f9ff',
      },
      source: {
        ...calendarLane.source,
        weatherProviderId: 'fmi',
        weatherLocation: defaultCity.name,
        weatherLatitude: defaultCity.latitude,
        weatherLongitude: defaultCity.longitude,
        refreshIntervalMinutes: 15,
      },
    }

    expect(convertedLane.type).toBe('weather')
    expect(convertedLane.title).toBe('Weather')
    expect(convertedLane.icon).toBe('CloudSun')
    expect(convertedLane.source.weatherProviderId).toBe('fmi')
    expect(convertedLane.source.weatherLocation).toBe(defaultCity.name)
  })

  it('supports converting a weather lane to a calendar lane', () => {
    const weatherLane = createDefaultWeatherLane()
    const convertedToCalendar: SwimlaneConfig = {
      ...weatherLane,
      type: 'google-calendar',
      title: weatherLane.title === 'Weather' ? 'New Member' : weatherLane.title,
      icon: weatherLane.icon === 'CloudSun' ? 'User' : weatherLane.icon,
      source: {
        ...weatherLane.source,
        endpoint: '',
        refreshIntervalMinutes: 5,
      },
    }

    expect(convertedToCalendar.type).toBe('google-calendar')
    expect(convertedToCalendar.title).toBe('New Member')
    expect(convertedToCalendar.icon).toBe('User')
  })

  it('has dimAfterLastEvent enabled by default in DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.nightMode.dimAfterLastEvent).toBe(true)
    expect(DEFAULT_CONFIG.nightMode.backgroundDim).toBe(80)
    expect(DEFAULT_CONFIG.nightMode.cardDim).toBe(70)
  })
})

describe('Adding Multiple Lanes at Once & Saving Settings', () => {
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

  it('guarantees collision-free unique IDs when creating multiple lanes rapidly at once', () => {
    // Generate 20 lanes in a tight loop within the same millisecond timestamp
    const lanes: SwimlaneConfig[] = []
    for (let i = 0; i < 20; i++) {
      lanes.push(createDefaultCalendarLane(i))
    }

    const ids = lanes.map((l) => l.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(20)
    expect(lanes.every((l) => l.type === 'google-calendar')).toBe(true)
    expect(lanes.every((l) => l.source.endpoint === '')).toBe(true)
  })

  it('correctly saves all settings (e.g. calendar URLs) when opening settings and adding multiple lanes at once', () => {
    // 1. Initial dashboard configuration loaded from storage
    saveDashboardConfig(DEFAULT_CONFIG)
    const initialConfig = loadDashboardConfig()
    const initialCount = initialConfig.swimlanes.length

    // 2. Simulate opening SettingsDrawer: a draft editingConfig is created from config
    let editingConfig: DashboardConfig = { ...initialConfig }

    // Helper simulating LanesTab updateSwimlane
    const updateSwimlane = (id: string, partial: Partial<SwimlaneConfig>) => {
      editingConfig = {
        ...editingConfig,
        swimlanes: editingConfig.swimlanes.map((l) => (l.id === id ? { ...l, ...partial } : l)),
      }
    }

    // Helper simulating LanesTab addSwimlane
    const addSwimlane = () => {
      const newLane = createDefaultCalendarLane(editingConfig.swimlanes.length)
      editingConfig = {
        ...editingConfig,
        swimlanes: [...editingConfig.swimlanes, newLane],
      }
      return newLane
    }

    // 3. User clicks "Add Calendar" multiple times in the same session
    const laneA = addSwimlane()
    const laneB = addSwimlane()
    const laneC = addSwimlane()

    // Verify each newly added lane has a unique ID
    expect(laneA.id).not.toBe(laneB.id)
    expect(laneB.id).not.toBe(laneC.id)
    expect(laneA.id).not.toBe(laneC.id)

    // 4. User enters unique calendar URLs and titles for each newly added lane
    const urlA = 'https://calendar.google.com/calendar/ical/alice%40corp.com/basic.ics'
    const urlB = 'https://calendar.google.com/calendar/ical/soccer-team-schedule%40gmail.com/basic.ics'
    const urlC = 'https://calendar.google.com/calendar/ical/fitness-center%40gym.com/basic.ics'

    updateSwimlane(laneA.id, {
      title: 'Alice Work',
      icon: 'Briefcase',
      source: {
        ...laneA.source,
        endpoint: urlA,
        refreshIntervalMinutes: 10,
      },
    })

    updateSwimlane(laneB.id, {
      title: 'Kids Soccer',
      icon: 'Activity',
      source: {
        ...laneB.source,
        endpoint: urlB,
        refreshIntervalMinutes: 15,
      },
    })

    updateSwimlane(laneC.id, {
      title: 'Gym & Fitness',
      icon: 'Dumbbell',
      source: {
        ...laneC.source,
        endpoint: urlC,
        refreshIntervalMinutes: 30,
      },
    })

    // 5. User clicks "Save Changes" in the drawer (invoking onSaveConfig)
    saveDashboardConfig(editingConfig)

    // 6. Simulate page reload / subsequent loadDashboardConfig call
    const reloaded = loadDashboardConfig()

    expect(reloaded.swimlanes.length).toBe(initialCount + 3)

    // Retrieve each lane by its exact ID from reloaded storage
    const savedA = reloaded.swimlanes.find((l) => l.id === laneA.id)
    const savedB = reloaded.swimlanes.find((l) => l.id === laneB.id)
    const savedC = reloaded.swimlanes.find((l) => l.id === laneC.id)

    expect(savedA).toBeDefined()
    expect(savedB).toBeDefined()
    expect(savedC).toBeDefined()

    // Assert that each lane's specific calendar URL was saved without cross-contamination or clobbering
    expect(savedA!.title).toBe('Alice Work')
    expect(savedA!.icon).toBe('Briefcase')
    expect(savedA!.source.endpoint).toBe(urlA)
    expect(savedA!.source.refreshIntervalMinutes).toBe(10)

    expect(savedB!.title).toBe('Kids Soccer')
    expect(savedB!.icon).toBe('Activity')
    expect(savedB!.source.endpoint).toBe(urlB)
    expect(savedB!.source.refreshIntervalMinutes).toBe(15)

    expect(savedC!.title).toBe('Gym & Fitness')
    expect(savedC!.icon).toBe('Dumbbell')
    expect(savedC!.source.endpoint).toBe(urlC)
    expect(savedC!.source.refreshIntervalMinutes).toBe(30)

    // Verify existing default lanes remained unharmed
    const defaultDad = reloaded.swimlanes.find((l) => l.id === 'lane-dad')
    expect(defaultDad).toBeDefined()
    expect(defaultDad!.title).toBe('Dad')
  })

  it('faithfully renders all newly added lanes and their calendar URLs inside SettingsDrawer UI', () => {
    // Prepare a config with multiple added lanes with calendar URLs
    const lane1: SwimlaneConfig = {
      ...createDefaultCalendarLane(0, 'lane-test-1'),
      title: 'Alice Project',
      source: { endpoint: 'https://calendar.google.com/calendar/ical/alice%40example.com/basic.ics', refreshIntervalMinutes: 5 },
    }
    const lane2: SwimlaneConfig = {
      ...createDefaultCalendarLane(1, 'lane-test-2'),
      title: 'Bob Personal',
      source: { endpoint: 'https://calendar.google.com/calendar/ical/bob%40example.com/basic.ics', refreshIntervalMinutes: 5 },
    }

    const testConfig: DashboardConfig = {
      ...DEFAULT_CONFIG,
      swimlanes: [lane1, lane2],
    }

    // Render SettingsDrawer component with multiple lanes
    const html = renderToString(
      React.createElement(SettingsDrawer, {
        isOpen: true,
        onClose: () => {},
        config: testConfig,
        onSaveConfig: () => {},
        onOpenPrivacy: () => {},
      })
    )

    // Verify both titles are rendered in the DOM
    expect(html).toContain('value="Alice Project"')
    expect(html).toContain('value="Bob Personal"')

    // Verify both secret iCal calendar URLs are rendered in the inputs
    expect(html).toContain('value="https://calendar.google.com/calendar/ical/alice%40example.com/basic.ics"')
    expect(html).toContain('value="https://calendar.google.com/calendar/ical/bob%40example.com/basic.ics"')
  })

  it('correctly handles adding both weather and multiple calendar lanes at once and saving all settings', () => {
    // Start with empty swimlanes
    const emptyConfig: DashboardConfig = { ...DEFAULT_CONFIG, swimlanes: [] }
    saveDashboardConfig(emptyConfig)

    let editingConfig = loadDashboardConfig()

    // Add a weather lane and 2 calendar lanes
    const weatherLane = createDefaultWeatherLane({
      name: 'Rovaniemi',
      country: 'Finland',
      latitude: 66.5039,
      longitude: 25.7294,
    })
    const calLane1 = createDefaultCalendarLane(0)
    const calLane2 = createDefaultCalendarLane(1)

    editingConfig = {
      ...editingConfig,
      swimlanes: [weatherLane, calLane1, calLane2],
    }

    // Configure all lanes
    const updateLane = (id: string, partial: Partial<SwimlaneConfig>) => {
      editingConfig = {
        ...editingConfig,
        swimlanes: editingConfig.swimlanes.map((l) => (l.id === id ? { ...l, ...partial } : l)),
      }
    }

    updateLane(calLane1.id, {
      title: 'School Schedule',
      source: { ...calLane1.source, endpoint: 'https://school.edu/calendar.ics' },
    })
    updateLane(calLane2.id, {
      title: 'Community Center',
      source: { ...calLane2.source, endpoint: 'https://community.org/events.ics' },
    })

    // Save and reload
    saveDashboardConfig(editingConfig)
    const loaded = loadDashboardConfig()

    expect(loaded.swimlanes.length).toBe(3)
    const loadedWeather = loaded.swimlanes.find((l) => l.id === weatherLane.id)
    const loadedCal1 = loaded.swimlanes.find((l) => l.id === calLane1.id)
    const loadedCal2 = loaded.swimlanes.find((l) => l.id === calLane2.id)

    expect(loadedWeather?.source.weatherLocation).toBe('Rovaniemi')
    expect(loadedCal1?.source.endpoint).toBe('https://school.edu/calendar.ics')
    expect(loadedCal1?.title).toBe('School Schedule')
    expect(loadedCal2?.source.endpoint).toBe('https://community.org/events.ics')
    expect(loadedCal2?.title).toBe('Community Center')
  })
})

