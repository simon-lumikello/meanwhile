import type { DashboardConfig } from './types'
import type { SwimlaneConfig } from './swimlane'
import { PRESET_COLORS } from './settingsConstants'

let laneCounter = 0

/**
 * Generates a collision-resistant unique lane ID, safe even for rapid/simultaneous additions.
 */
export function generateUniqueLaneId(prefix = 'lane'): string {
  laneCounter += 1
  return `${prefix}-${Date.now()}-${laneCounter}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Creates a fully-configured default Calendar lane instance with a collision-free ID.
 */
export function createDefaultCalendarLane(index = 0, id?: string): SwimlaneConfig {
  return {
    id: id ?? generateUniqueLaneId('lane-cal'),
    title: 'New Member',
    enabled: true,
    type: 'google-calendar',
    icon: 'User',
    colorScheme: PRESET_COLORS[index % PRESET_COLORS.length],
    source: {
      endpoint: '',
      refreshIntervalMinutes: 5,
    },
  }
}

// ─── Demo cities for first-launch weather ────────────────────────
// Locked to Helsinki for FMI-specific feature showcase.

export interface DemoCity {
  name: string
  country: string
  latitude: number
  longitude: number
}

export const DEMO_CITIES: DemoCity[] = [
  { name: 'Helsinki', country: 'Finland', latitude: 60.1695, longitude: 24.9354 },
]

/**
 * Returns the default demo city (Helsinki).
 */
export function pickDemoCity(): DemoCity {
  return DEMO_CITIES[0]
}

/**
 * Creates a fully-configured default Weather lane instance.
 */
export function createDefaultWeatherLane(cityOverride?: DemoCity, id?: string): SwimlaneConfig {
  const selectedCity = cityOverride ?? pickDemoCity()
  return {
    id: id ?? generateUniqueLaneId('lane-weather'),
    title: 'Weather',
    enabled: true,
    type: 'weather',
    icon: 'CloudSun',
    colorScheme: {
      primary: '#38bdf8', // Sky blue
      secondary: 'rgba(56, 189, 248, 0.12)',
      accent: '#7dd3fc',
      text: '#f0f9ff',
    },
    source: {
      endpoint: '',
      weatherProviderId: 'fmi',
      weatherLocation: selectedCity.name,
      weatherLatitude: selectedCity.latitude,
      weatherLongitude: selectedCity.longitude,
      weatherLocationMode: 'manual',
      manualLocation: {
        name: selectedCity.name,
        latitude: selectedCity.latitude,
        longitude: selectedCity.longitude,
      },
      refreshIntervalMinutes: 15,
      showRainAlerts: true,
    },
  }
}

// ─── Default dashboard configuration ────────────────────────────────────────

const city = pickDemoCity()

export const DEFAULT_CONFIG: DashboardConfig = {
  theme: 'dark',
  orientation: 'horizontal',
  mutePastEvents: true,
  clock24h: true,
  idleResetMinutes: 2,
  kioskMode: false,
  zebraStriping: true,
  gridLineIntensity: 'medium',
  welcomeSeen: false,
  nightMode: {
    enabled: true,
    startHour: 23,
    endHour: 6,
    dimAfterLastEvent: true,
    dimAfterLastEventGraceSeconds: 30,
    backgroundDim: 80,
    cardDim: 70,
    auroraAlerts: true,
    showWeekAhead: false,
  },
  weatherMap: {
    showOnTimeline: true,
    showOnAmbient: true,
    size: 'standard',
    showAirplanes: true,
    zoom: 'close',
    filterMode: 'clouds',
    renderMode: 'realistic-clouds',
    cloudTransparency: 'solid',
    cloudLighting: 'time-of-day',
  },
  swimlanes: [
    createDefaultWeatherLane(city, 'lane-weather'),
    {
      id: 'lane-dad',
      title: 'Dad',
      enabled: true,
      type: 'google-calendar',
      icon: 'User',
      colorScheme: {
        primary: '#3b82f6', // Cobalt blue
        secondary: 'rgba(59, 130, 246, 0.16)',
        accent: '#60a5fa',
        text: '#ffffff',
      },
      source: {
        endpoint: '',
        refreshIntervalMinutes: 5,
      },
    },
    {
      id: 'lane-mom',
      title: 'Mom',
      enabled: true,
      type: 'google-calendar',
      icon: 'Heart',
      colorScheme: {
        primary: '#ec4899', // Rose pink
        secondary: 'rgba(236, 72, 153, 0.16)',
        accent: '#f472b6',
        text: '#ffffff',
      },
      source: {
        endpoint: '',
        refreshIntervalMinutes: 5,
      },
    },
    {
      id: 'lane-kids',
      title: 'Kids & School',
      enabled: true,
      type: 'google-calendar',
      icon: 'GraduationCap',
      colorScheme: {
        primary: '#10b981', // Emerald green
        secondary: 'rgba(16, 185, 129, 0.16)',
        accent: '#34d399',
        text: '#ffffff',
      },
      source: {
        endpoint: '',
        refreshIntervalMinutes: 5,
      },
    },
    {
      id: 'lane-family',
      title: 'Family Shared',
      enabled: true,
      type: 'google-calendar',
      icon: 'Calendar',
      colorScheme: {
        primary: '#f59e0b', // Amber
        secondary: 'rgba(245, 158, 11, 0.16)',
        accent: '#fbbf24',
        text: '#ffffff',
      },
      source: {
        endpoint: '',
        refreshIntervalMinutes: 5,
      },
    },
  ],
}
