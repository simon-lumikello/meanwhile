import { describe, expect, it } from 'bun:test'
import { createDefaultWeatherLane, type SwimlaneConfig } from '@dashboard/features/settings'

describe('Weather Location Mode Switching (Hand-picked vs Auto-detected)', () => {
  it('creates default weather lane with weatherLocationMode as manual', () => {
    const lane = createDefaultWeatherLane()
    expect(lane.source.weatherLocationMode).toBe('manual')
    expect(lane.source.manualLocation).toBeDefined()
    expect(lane.source.manualLocation?.name).toBe(lane.source.weatherLocation!)
    expect(lane.source.manualLocation?.latitude).toBe(lane.source.weatherLatitude!)
    expect(lane.source.manualLocation?.longitude).toBe(lane.source.weatherLongitude!)
  })

  it('preserves hand-picked manual location when switching to auto mode', () => {
    const lane = createDefaultWeatherLane()
    // User hand-picks 'Tampere'
    lane.source.weatherLocation = 'Tampere'
    lane.source.weatherLatitude = 61.4978
    lane.source.weatherLongitude = 23.7610
    lane.source.manualLocation = {
      name: 'Tampere',
      latitude: 61.4978,
      longitude: 23.7610,
    }

    // Now switch to auto with detected coordinates (e.g. Helsinki GPS)
    const detected = {
      name: 'Helsinki',
      latitude: 60.1699,
      longitude: 24.9384,
      method: 'gps' as const,
    }

    const autoLane: SwimlaneConfig = {
      ...lane,
      source: {
        ...lane.source,
        weatherLocationMode: 'auto',
        weatherLocation: detected.name,
        weatherLatitude: detected.latitude,
        weatherLongitude: detected.longitude,
        autoLocation: detected,
      },
    }

    expect(autoLane.source.weatherLocationMode).toBe('auto')
    expect(autoLane.source.weatherLocation).toBe('Helsinki')
    expect(autoLane.source.weatherLatitude).toBe(60.1699)
    expect(autoLane.source.manualLocation?.name).toBe('Tampere')

    // Now switch back to manual mode
    const restoredLane: SwimlaneConfig = {
      ...autoLane,
      source: {
        ...autoLane.source,
        weatherLocationMode: 'manual',
        weatherLocation: autoLane.source.manualLocation!.name,
        weatherLatitude: autoLane.source.manualLocation!.latitude,
        weatherLongitude: autoLane.source.manualLocation!.longitude,
      },
    }

    expect(restoredLane.source.weatherLocationMode).toBe('manual')
    expect(restoredLane.source.weatherLocation).toBe('Tampere')
    expect(restoredLane.source.weatherLatitude).toBe(61.4978)
    expect(restoredLane.source.weatherLongitude).toBe(23.7610)
  })

  it('treats missing weatherLocationMode as manual for backward compatibility', () => {
    const legacyLane: SwimlaneConfig = {
      id: 'weather-legacy',
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
        weatherLocation: 'Berlin',
        weatherLatitude: 52.52,
        weatherLongitude: 13.405,
      },
    }

    const mode = legacyLane.source.weatherLocationMode || 'manual'
    expect(mode).toBe('manual')
  })
})
