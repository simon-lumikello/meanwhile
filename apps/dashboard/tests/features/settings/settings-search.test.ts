import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_CONFIG,
  SETTINGS_SEARCH_INDEX,
  createDefaultCalendarLane,
  createDefaultWeatherLane,
  searchSettings,
  type DashboardConfig,
  type SettingsTab,
} from '@dashboard/features/settings'
import { LanesTab } from '@dashboard/features/settings/tabs/LanesTab'
import { DisplayTab } from '@dashboard/features/settings/tabs/DisplayTab'
import { AmbientTab } from '@dashboard/features/settings/tabs/AmbientTab'
import { RadarTab } from '@dashboard/features/settings/tabs/RadarTab'
import { BackupTab } from '@dashboard/features/settings/tabs/BackupTab'

const topResult = (query: string) => searchSettings(query)[0]?.entry.id

describe('settings search', () => {
  it('finds settings by their names', () => {
    expect(topResult('theme')).toBe('theme')
    expect(topResult('24-hour clock')).toBe('clock-format')
    expect(topResult('zebra')).toBe('zebra-striping')
    expect(topResult('flight traffic')).toBe('map-flights')
  })

  it('finds settings by what people call them instead', () => {
    expect(topResult('dark mode')).toBe('theme')
    expect(topResult('dark')).toBe('theme')
    expect(topResult('am pm')).toBe('clock-format')
    expect(topResult('screensaver')).toBe('night-dimmer')
    expect(topResult('planes')).toBe('map-flights')
    expect(topResult('city')).toBe('weather-location')
    expect(topResult('restore')).toBe('backup-import')
    expect(topResult('factory')).toBe('backup-reset')
    expect(topResult('ical')).toBe('calendar-source')
  })

  it('matches prefixes as people type and forgives a typo', () => {
    expect(topResult('auro')).toBe('aurora-alerts')
    expect(topResult('aurroa')).toBe('aurora-alerts')
    expect(topResult('calender url')).toBe('calendar-source')
    expect(topResult('Kiosk')).toBe('kiosk-mode')
  })

  it('needs every word to match', () => {
    const ids = searchSettings('weather map size').map((result) => result.entry.id)
    expect(ids[0]).toBe('map-size')
    expect(ids).not.toContain('theme')
    expect(searchSettings('dark quokka')).toEqual([])
  })

  it('returns nothing for an empty query', () => {
    expect(searchSettings('')).toEqual([])
    expect(searchSettings('   ')).toEqual([])
  })

  it('has a unique anchor id for every entry', () => {
    const ids = SETTINGS_SEARCH_INDEX.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('points every entry at a row its section renders', () => {
    // Everything showing: a Finnish FMI weather lane (radar eligible), a calendar lane, and the night dimmer on.
    const config: DashboardConfig = {
      ...DEFAULT_CONFIG,
      nightMode: { ...DEFAULT_CONFIG.nightMode, enabled: true },
      swimlanes: [
        createDefaultWeatherLane({ name: 'Helsinki', country: 'Finland', latitude: 60.1699, longitude: 24.9384 }),
        createDefaultCalendarLane(0, 'lane-search-test'),
      ],
    }
    const props = { editingConfig: config, setEditingConfig: () => {} }
    const noop = () => {}
    const sections: Record<SettingsTab, React.ReactElement> = {
      swimlanes: React.createElement(LanesTab, { ...props, onImportPendingChange: noop, onOpenPrivacy: noop, onOpenSelfHost: noop }),
      display: React.createElement(DisplayTab, props),
      ambient: React.createElement(AmbientTab, props),
      radar: React.createElement(RadarTab, props),
      backup: React.createElement(BackupTab, { ...props, onOpenPrivacy: noop, onOpenSelfHost: noop }),
    }
    const queryClient = new QueryClient()
    const html = Object.fromEntries(
      Object.entries(sections).map(([section, element]) => [
        section,
        renderToString(React.createElement(QueryClientProvider, { client: queryClient }, element)),
      ]),
    ) as Record<SettingsTab, string>

    for (const entry of SETTINGS_SEARCH_INDEX) {
      expect({ id: entry.id, rendered: html[entry.section].includes(`data-setting-id="${entry.id}"`) }).toEqual({ id: entry.id, rendered: true })
      if (entry.fallback) {
        expect({ id: entry.fallback.id, rendered: html[entry.section].includes(`data-setting-id="${entry.fallback.id}"`) }).toEqual({ id: entry.fallback.id, rendered: true })
      }
    }
  })
})
