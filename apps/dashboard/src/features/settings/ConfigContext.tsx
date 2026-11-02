import React, { useState, useCallback, useMemo } from 'react'
import type { DashboardConfig, WeatherMapConfig } from './types'
import { loadDashboardConfig, saveDashboardConfig } from './storage'
import { ConfigContext } from './configContextDefinition'

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<DashboardConfig>(loadDashboardConfig)

  const saveConfig = useCallback((newConfig: DashboardConfig, options?: { requirePersistence?: boolean }) => {
    const saved = saveDashboardConfig(newConfig)
    if (!saved && options?.requirePersistence) throw new Error('Browser storage is full or unavailable')
    setConfig(newConfig)
  }, [])

  const updateConfig = useCallback((updater: (prev: DashboardConfig) => DashboardConfig) => {
    setConfig((prev) => {
      const next = updater(prev)
      saveDashboardConfig(next)
      return next
    })
  }, [])

  const updateWeatherMap = useCallback(
    (patch: Partial<WeatherMapConfig>) => {
      updateConfig((prev) => ({ ...prev, weatherMap: { ...prev.weatherMap, ...patch } }))
    },
    [updateConfig]
  )

  const value = useMemo(
    () => ({
      config,
      saveConfig,
      updateConfig,
      updateWeatherMap,
    }),
    [config, saveConfig, updateConfig, updateWeatherMap]
  )

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}
