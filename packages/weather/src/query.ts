import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import type { AuroraKpPoint } from './aurora'
import { calculateDailyOutlook, type DailyOutlook } from './weatherForecast'
import { searchWeatherLocations, type LocationSearchResult } from './locationProvider'
import { fetchKpForecast } from './noaaProvider'
import type { WeatherProvider, WeatherProviderConfig, WeatherTransport } from './providerTypes'
import type { HourlyWeatherPoint } from './weather'

const FORECAST_REFRESH_MS = 3 * 60 * 1000
const AURORA_REFRESH_MS = 15 * 60 * 1000

export interface WeatherForecastQueryInput {
  provider: WeatherProvider
  date: Date
  config: WeatherProviderConfig
  /**
   * A consumer-owned mapping discriminator. Dashboard radar enrichment uses one
   * so an enriched result can never occupy the provider-only cache entry.
   */
  mappingKey?: string
  enabled?: boolean
  now?: Date
  fetchForecast?: (input: { signal: AbortSignal }) => Promise<HourlyWeatherPoint[]>
}

function weatherConfigKey(config: WeatherProviderConfig): WeatherProviderConfig {
  return {
    ...config,
    latitude: config.latitude,
    longitude: config.longitude,
    place: config.place,
  }
}

export function weatherForecastQueryKey({ provider, date, config, mappingKey = 'provider' }: WeatherForecastQueryInput) {
  return [
    'weather',
    'forecast',
    provider.id,
    format(date, 'yyyy-MM-dd'),
    weatherConfigKey(config),
    mappingKey,
  ] as const
}

export function weatherForecastQueryOptions(input: WeatherForecastQueryInput) {
  const { provider, date, config, enabled = true, now, fetchForecast } = input
  return queryOptions({
    queryKey: weatherForecastQueryKey(input),
    queryFn: ({ signal }) => fetchForecast
      ? fetchForecast({ signal })
      : provider.fetchForecast({ date, config, now, signal }),
    enabled,
    refetchInterval: FORECAST_REFRESH_MS,
    staleTime: 60 * 1000,
  })
}

export function useWeatherForecastQuery(input: WeatherForecastQueryInput) {
  return useQuery(weatherForecastQueryOptions(input))
}

export interface WeekForecastQueryInput {
  provider: WeatherProvider
  /** The first day of the outlook, usually the day after tomorrow. */
  startDate: Date
  days: number
  config: WeatherProviderConfig
  enabled?: boolean
  now?: Date
}

export function weekForecastQueryKey({ provider, startDate, days, config }: WeekForecastQueryInput) {
  return [
    'weather',
    'week-outlook',
    provider.id,
    format(startDate, 'yyyy-MM-dd'),
    days,
    weatherConfigKey(config),
  ] as const
}

/**
 * Day summaries for the week outlook. Polls like the other forecasts, and keeps the previous
 * outlook through the midnight key change so the cards never blink out.
 */
export function weekForecastQueryOptions(input: WeekForecastQueryInput) {
  const { provider, startDate, days, config, enabled = true, now } = input
  return queryOptions<DailyOutlook[]>({
    queryKey: weekForecastQueryKey(input),
    queryFn: async ({ signal }) => {
      if (!provider.fetchWeekForecast) return []
      const points = await provider.fetchWeekForecast({ startDate, days, config, now, signal })
      return calculateDailyOutlook(points, startDate, days)
    },
    enabled,
    refetchInterval: FORECAST_REFRESH_MS,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useWeekForecastQuery(input: WeekForecastQueryInput) {
  return useQuery(weekForecastQueryOptions(input))
}

export interface AuroraForecastQueryInput {
  enabled?: boolean
  sourceId?: string
}

export function auroraForecastQueryKey(sourceId = 'noaa-swpc') {
  return ['weather', 'aurora-kp-forecast', sourceId] as const
}

export function auroraForecastQueryOptions({ enabled = true, sourceId = 'noaa-swpc' }: AuroraForecastQueryInput = {}) {
  return queryOptions<AuroraKpPoint[]>({
    queryKey: auroraForecastQueryKey(sourceId),
    queryFn: ({ signal }) => fetchKpForecast({ signal }),
    enabled,
    refetchInterval: AURORA_REFRESH_MS,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAuroraForecastQuery(input: AuroraForecastQueryInput = {}) {
  return useQuery(auroraForecastQueryOptions(input))
}

export interface LocationSearchQueryInput {
  query: string
  /** The forecast provider the place is for; `fmi` limits suggestions to Finland. */
  providerId?: string
  enabled?: boolean
  transport?: WeatherTransport
}

const LOCATION_SEARCH_MIN_LENGTH = 2

export function locationSearchQueryKey({ query, providerId = 'any' }: Pick<LocationSearchQueryInput, 'query' | 'providerId'>) {
  return ['weather', 'location-search', providerId, query.trim().toLowerCase()] as const
}

/** Place-name suggestions; runs only for queries of two or more characters. */
export function locationSearchQueryOptions({ query, providerId, enabled = true, transport }: LocationSearchQueryInput) {
  const trimmed = query.trim()
  return queryOptions<LocationSearchResult[]>({
    queryKey: locationSearchQueryKey({ query: trimmed, providerId }),
    queryFn: ({ signal }) => searchWeatherLocations(trimmed, providerId, { signal, transport }),
    enabled: enabled && trimmed.length >= LOCATION_SEARCH_MIN_LENGTH,
    staleTime: 5 * 60 * 1000,
  })
}

export function useLocationSearchQuery(input: LocationSearchQueryInput) {
  return useQuery(locationSearchQueryOptions(input))
}

export const weatherQueryCadence = {
  forecastRefreshMs: FORECAST_REFRESH_MS,
  auroraRefreshMs: AURORA_REFRESH_MS,
} as const
