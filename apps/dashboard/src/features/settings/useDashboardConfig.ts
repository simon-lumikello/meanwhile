import { useContext } from 'react'
import { ConfigContext, type ConfigContextValue } from './configContextDefinition'

export function useDashboardConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext)
  if (!ctx) {
    throw new Error('useDashboardConfig must be used within a ConfigProvider')
  }
  return ctx
}
