import type { DashboardConfig } from './types'
import { DEFAULT_CONFIG } from './defaultConfig'

const STORAGE_KEY = 'family_dashboard_config_v1'

export function loadDashboardConfig(): DashboardConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw)

    // Fill in fields added since the config was saved
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      nightMode: { ...DEFAULT_CONFIG.nightMode, ...(parsed.nightMode || {}) },
      weatherMap: { ...DEFAULT_CONFIG.weatherMap, ...(parsed.weatherMap || {}) },
      swimlanes: Array.isArray(parsed.swimlanes) ? parsed.swimlanes : DEFAULT_CONFIG.swimlanes,
    }
  } catch (err) {
    console.warn('Failed to load dashboard config from localStorage, using default', err)
    return DEFAULT_CONFIG
  }
}

export function saveDashboardConfig(config: DashboardConfig): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    return true
  } catch (err) {
    console.error('Failed to save dashboard config to localStorage', err)
    return false
  }
}

export function exportConfigAsJson(config: DashboardConfig): string {
  return JSON.stringify(config, null, 2)
}

export function importConfigFromJson(jsonStr: string): DashboardConfig {
  const parsed = JSON.parse(jsonStr)
  if (!parsed.swimlanes || !Array.isArray(parsed.swimlanes)) {
    throw new Error('Invalid dashboard configuration JSON')
  }
  return parsed
}
