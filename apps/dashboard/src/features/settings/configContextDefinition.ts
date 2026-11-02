import { createContext } from 'react'
import type { DashboardConfig, WeatherMapConfig } from './types'

export interface ConfigContextValue {
  config: DashboardConfig
  saveConfig: (newConfig: DashboardConfig, options?: { requirePersistence?: boolean }) => void
  updateConfig: (updater: (prev: DashboardConfig) => DashboardConfig) => void
  updateWeatherMap: (patch: Partial<WeatherMapConfig>) => void
}

export const ConfigContext = createContext<ConfigContextValue | null>(null)
