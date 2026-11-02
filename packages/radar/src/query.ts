import { queryOptions, useQuery } from '@tanstack/react-query'
import type { WindData } from '@simon-lumikello/meanwhile-weather/core'
import { evaluateThunderstormStatus, type ThunderstormStatus } from './lightning'
import { AircraftRequestError, fetchAircraft, fetchAircraftRegion, STANDARD_AIRPLANE_RADIUS_NM, type AircraftSourceConfig } from './sources/aircraft'
import type { AirplaneData } from './types'
import { fetchFmiLightning } from './sources/lightning'
import { fetchFmiRadarRainRate, fetchFmiProximityRainAlert, fetchOpenMeteoWind, type FmiRadarRequest } from './sources/fmi'
import type { RainProximityAlert } from './types'

const EMPTY_THUNDERSTORM: ThunderstormStatus = { isActive: false, strikes: [], recentStrikeCount: 0, closestStrikeKm: null, closestStrikeBearing: null, summary: 'No active thunderstorm' }
const valid = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon)
const rounded = (value: number) => Math.round(value * 100) / 100

/**
 * A failed request for a new area would leave the view empty until the next
 * attempt, so retries come quickly; the 30-second refresh paces everything else.
 */
export function aircraftQueryOptions(lat: number, lon: number, config: AircraftSourceConfig, enabled = true, radiusNm = STANDARD_AIRPLANE_RADIUS_NM) {
  return queryOptions<AirplaneData[]>({ queryKey: ['radar', 'aircraft', rounded(lat), rounded(lon), radiusNm, config.relayUrl ?? null], queryFn: ({ signal }) => fetchAircraft(lat, lon, config, signal, radiusNm), enabled: enabled && valid(lat, lon) && Boolean(config.relayUrl), refetchInterval: 30000, staleTime: 25000, refetchIntervalInBackground: false, retry: 2, retryDelay: attempt => 2000 * 2 ** attempt, placeholderData: previous => previous })
}
export function lightningQueryOptions(lat: number, lon: number, enabled = true, request: FmiRadarRequest = {}) {
  return queryOptions<ThunderstormStatus>({ queryKey: ['radar', 'fmi-lightning', rounded(lat), rounded(lon), enabled], queryFn: ({ signal }) => fetchFmiLightning(lat, lon, 35000, { ...request, signal }).then(strikes => evaluateThunderstormStatus(strikes, lat, lon, 50)), enabled: enabled && valid(lat, lon), refetchInterval: 60_000, staleTime: 30_000, refetchOnWindowFocus: true })
}
export function radarRainRateQueryOptions(lat: number, lon: number, enabled = true, request: FmiRadarRequest = {}) { return queryOptions<number | null>({ queryKey: ['radar', 'fmi-rain-rate', rounded(lat), rounded(lon), enabled], queryFn: ({ signal }) => fetchFmiRadarRainRate(lat, lon, { ...request, signal }), enabled: enabled && valid(lat, lon), refetchInterval: 60_000, staleTime: 30_000 }) }
export function radarRainAlertQueryOptions(lat: number, lon: number, temperature: number, enabled = true, request: FmiRadarRequest = {}) { return queryOptions<RainProximityAlert | null>({ queryKey: ['radar', 'fmi-rain-alert', rounded(lat), rounded(lon), Math.round(temperature), enabled], queryFn: ({ signal }) => fetchFmiProximityRainAlert(lat, lon, temperature, { ...request, signal }), enabled: enabled && valid(lat, lon), refetchInterval: 120_000, staleTime: 60_000 }) }
export function radarWindQueryOptions(lat: number, lon: number, enabled = true, request: FmiRadarRequest = {}) { return queryOptions<WindData | null>({ queryKey: ['radar', 'wind', rounded(lat), rounded(lon), enabled], queryFn: ({ signal }) => fetchOpenMeteoWind(lat, lon, { ...request, signal }), enabled: enabled && valid(lat, lon), refetchInterval: 180_000, staleTime: 60_000 }) }

export function useAircraftQuery(lat: number, lon: number, config: AircraftSourceConfig, enabled = true, radiusNm?: number) { return useQuery(aircraftQueryOptions(lat, lon, config, enabled, radiusNm)) }

/** How often a region snapshot is refreshed. The renderer extrapolates positions in between. */
export const AIRCRAFT_REGION_REFRESH_MS = 30_000

/**
 * Aircraft over a whole region served by the relay (see `fetchAircraftRegion`).
 * One shared poll covers every view of the map, so zooming and panning never
 * request anything. A throttled upstream is not retried: the previous snapshot
 * stays on screen until the next refresh.
 */
export function aircraftRegionQueryOptions(region: string, config: AircraftSourceConfig, enabled = true) {
  return queryOptions<AirplaneData[]>({
    queryKey: ['radar', 'aircraft-region', region, config.relayUrl ?? null],
    queryFn: ({ signal }) => fetchAircraftRegion(region, config, signal),
    enabled: enabled && Boolean(region) && Boolean(config.relayUrl),
    refetchInterval: AIRCRAFT_REGION_REFRESH_MS,
    staleTime: AIRCRAFT_REGION_REFRESH_MS - 5_000,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => failureCount < 1 && !(error instanceof AircraftRequestError && error.status === 429),
    retryDelay: 15_000,
    placeholderData: previous => previous,
  })
}

export function useAircraftRegionQuery(region: string, config: AircraftSourceConfig, enabled = true) { return useQuery(aircraftRegionQueryOptions(region, config, enabled)) }
export function useThunderstormQuery(lat: number, lon: number, enabled = true, request?: FmiRadarRequest) { return useQuery(lightningQueryOptions(lat, lon, enabled, request)).data ?? EMPTY_THUNDERSTORM }
