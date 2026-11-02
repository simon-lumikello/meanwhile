import { describe, expect, it } from 'bun:test'
import { PRESET_COLORS, AVAILABLE_ICONS, DEFAULT_CONFIG, type DashboardConfig } from '@dashboard/features/settings'

describe('Settings Rework Architecture & Controls Verification', () => {
  it('exports valid color presets and available icons', () => {
    expect(PRESET_COLORS.length).toBeGreaterThanOrEqual(8)
    expect(PRESET_COLORS[0]).toHaveProperty('primary')
    expect(PRESET_COLORS[0]).toHaveProperty('secondary')
    expect(PRESET_COLORS[0]).toHaveProperty('label')

    expect(AVAILABLE_ICONS).toContain('User')
    expect(AVAILABLE_ICONS).toContain('CloudSun')
    expect(AVAILABLE_ICONS).toContain('Calendar')
    expect(AVAILABLE_ICONS).toContain('Star')
  })

  it('supports updating night dimmer startHour and endHour schedule', () => {
    let cfg: DashboardConfig = { ...DEFAULT_CONFIG }
    expect(cfg.nightMode.startHour).toBe(23)
    expect(cfg.nightMode.endHour).toBe(6)

    // User updates schedule to 21:00 - 07:00
    cfg = {
      ...cfg,
      nightMode: {
        ...cfg.nightMode,
        startHour: 21,
        endHour: 7,
      },
    }

    expect(cfg.nightMode.startHour).toBe(21)
    expect(cfg.nightMode.endHour).toBe(7)
  })

  it('defaults the weather map to both screens at standard size with realistic clouds', () => {
    expect(DEFAULT_CONFIG.weatherMap).toEqual({
      showOnTimeline: true,
      showOnAmbient: true,
      size: 'standard',
      showAirplanes: true,
      zoom: 'close',
      filterMode: 'clouds',
      renderMode: 'realistic-clouds',
      cloudTransparency: 'solid',
      cloudLighting: 'time-of-day',
    })
  })
})
