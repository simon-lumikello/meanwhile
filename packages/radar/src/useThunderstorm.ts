import type { ThunderstormStatus } from './lightning'
import { useThunderstormQuery } from './query'

export interface UseThunderstormOptions {
  lat: number
  lon: number
  enabled?: boolean
  pollIntervalMs?: number
}

/**
 * Manages live lightning strike observations and thunderstorm status via TanStack Query.
 * Queries Finnish Meteorological Institute (FMI) Open Data WFS observations with automatic background polling.
 */
export function useThunderstorm({
  lat,
  lon,
  enabled = true,
  pollIntervalMs = 60 * 1000,
}: UseThunderstormOptions): ThunderstormStatus {
  void pollIntervalMs
  return useThunderstormQuery(lat, lon, enabled)
}
