import { useQuery } from '@tanstack/react-query'
import { addDays } from 'date-fns'
import { DEMO_CITIES, type SwimlaneConfig, type DemoCity } from '@dashboard/features/settings'
import type { DailyOutlook, HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import { getWeatherProvider } from '@simon-lumikello/meanwhile-weather/providers'
import { auroraForecastQueryOptions, weatherForecastQueryOptions, weekForecastQueryOptions } from '@simon-lumikello/meanwhile-weather/query'
import {
  fetchFmiProximityRainAlert,
  fetchFmiRadarRainRate,
  fetchOpenMeteoWind,
  createFmiRadarFrameSource,
} from '@simon-lumikello/meanwhile-radar/sources'
import type { AirplaneData, RadarFrameSource, RainProximityAlert } from '@simon-lumikello/meanwhile-radar/core'
import { useAircraftRegionQuery } from '@simon-lumikello/meanwhile-radar/query'
import type { WindData } from '@simon-lumikello/meanwhile-weather/core'
import { isDashboardRadarEligible } from '@dashboard/services/radar/radarEligibility'
import {
  fetchDashboardWeatherForecast,
  reconcileRainAlertWithTimeline,
} from '@dashboard/services/weather/weatherComposition'

export interface ResolvedWeatherCoords {
  location: string
  lat: number
  lon: number
  providerId: string
  isRadarSupported: boolean
}

export function resolveWeatherCoords(
  lane: SwimlaneConfig | undefined,
  demoCity: DemoCity
): ResolvedWeatherCoords {
  const providerId = lane?.source.weatherProviderId || 'open-meteo'
  const location = lane?.source.weatherLocation || demoCity.name
  const storedLat = lane?.source.weatherLatitude
  const storedLon = lane?.source.weatherLongitude
  const demoCityMatch = DEMO_CITIES.find(
    (c) => c.name.toLowerCase() === location.toLowerCase()
  )
  const lat = storedLat ?? demoCityMatch?.latitude ?? demoCity.latitude
  const lon = storedLon ?? demoCityMatch?.longitude ?? demoCity.longitude
  const radarSupported = isDashboardRadarEligible(providerId, lat, lon)

  return {
    location,
    lat,
    lon,
    providerId,
    isRadarSupported: radarSupported,
  }
}

export function useWeatherForecast(
  activeLane: SwimlaneConfig | undefined,
  hasEnabledWeatherLane: boolean,
  selectedDate: Date,
  demoCity: DemoCity
) {
  const coords = resolveWeatherCoords(activeLane, demoCity)
  const provider = getWeatherProvider(coords.providerId)
  const weatherConfig = {
    place: coords.location,
    latitude: coords.lat,
    longitude: coords.lon,
  }
  const currentTime = new Date()
  const todayDate = new Date(currentTime)
  const tomorrowDate = addDays(todayDate, 1)
  const dashboardForecast = (date: Date, enabled = true) => weatherForecastQueryOptions({
    provider,
    date,
    config: weatherConfig,
    enabled,
    mappingKey: 'dashboard-fmi-radar-v1',
    now: currentTime,
    fetchForecast: ({ signal }) => fetchDashboardWeatherForecast(provider, date, weatherConfig, {
      currentTime,
      signal,
    }),
  })
  const todayQuery = useQuery(dashboardForecast(todayDate))
  const tomorrowQuery = useQuery(dashboardForecast(tomorrowDate))
  const selectedQuery = useQuery(dashboardForecast(selectedDate, hasEnabledWeatherLane))

  return {
    todayWeatherPoints: todayQuery.data ?? [],
    tomorrowWeatherPoints: tomorrowQuery.data ?? [],
    weatherPoints: selectedQuery.data ?? [],
    weatherLocationName: coords.location,
    isWeatherLoading: todayQuery.isLoading || tomorrowQuery.isLoading || (hasEnabledWeatherLane && selectedQuery.isLoading),
    coords,
    refetchWeather: () => Promise.all([todayQuery.refetch(), tomorrowQuery.refetch(), selectedQuery.refetch()]),
  }
}

/** The five days after tomorrow for the lock screen's week outlook; fetched only while it is switched on. */
export function useWeekOutlook(coords: ResolvedWeatherCoords, enabled: boolean): DailyOutlook[] {
  const provider = getWeatherProvider(coords.providerId)
  const today = new Date()
  const query = useQuery(weekForecastQueryOptions({
    provider,
    startDate: addDays(today, 2),
    days: 5,
    config: { place: coords.location, latitude: coords.lat, longitude: coords.lon },
    enabled,
    now: today,
  }))
  return query.data ?? []
}

export function useRainAlert(
  coords: ResolvedWeatherCoords,
  todayWeatherPoints: HourlyWeatherPoint[],
  enabled: boolean
) {
  const curHour = new Date().getHours()
  const curTemp = todayWeatherPoints[curHour]?.temperature ?? 15

  const query = useQuery<RainProximityAlert | null>({
    queryKey: ['rain-alert', coords.lat, coords.lon, coords.isRadarSupported, enabled, Math.round(curTemp)],
    queryFn: async () => {
      if (!enabled || !coords.isRadarSupported) return null
      try {
        return await fetchFmiProximityRainAlert(coords.lat, coords.lon, curTemp)
      } catch {
        return null
      }
    },
    enabled: enabled && coords.isRadarSupported,
    refetchInterval: 2 * 60 * 1000, // Refresh every 2 minutes
    staleTime: 60 * 1000,
  })

  return enabled ? reconcileRainAlertWithTimeline(query.data ?? null, todayWeatherPoints) : null
}

export function useAuroraForecast(enabled: boolean) {
  const query = useQuery(auroraForecastQueryOptions({ enabled }))

  return query.data ?? []
}

export function useRadarWind(lat: number, lon: number, enabled = true) {
  return useQuery<WindData | null>({
    queryKey: ['radar-wind', lat, lon],
    queryFn: async () => {
      try {
        return await fetchOpenMeteoWind(lat, lon)
      } catch {
        return null
      }
    },
    enabled: enabled && Number.isFinite(lat) && Number.isFinite(lon),
    refetchInterval: 3 * 60 * 1000,
    staleTime: 60 * 1000,
  })
}

export function useRadarRainRate(lat: number, lon: number, enabled = true) {
  return useQuery<number | null>({
    queryKey: ['radar-rain-rate', lat, lon],
    queryFn: async () => {
      try {
        return await fetchFmiRadarRainRate(lat, lon)
      } catch {
        return null
      }
    },
    enabled: enabled && Number.isFinite(lat) && Number.isFinite(lon),
    refetchInterval: 60 * 1000, // 1 minute interval for live rain rate
    staleTime: 30 * 1000,
  })
}

/** Whole-coverage FMI frames: the radar requests and refreshes scans itself, independent of zoom and pan. */
const FMI_RADAR_SOURCE = createFmiRadarFrameSource()

const AIRCRAFT_SOURCE = { relayUrl: '/api/adsb-proxy' }
/** The relay region (see `aircraftRelay.ts`); the FMI radar, and so the aircraft overlay, only covers Finland. */
export const DASHBOARD_AIRCRAFT_REGION = 'finland'

export interface DashboardRadarScene {
  radarSource?: RadarFrameSource
  airplanes: AirplaneData[]
}

/**
 * Dashboard-owned radar composition. The relay URL is explicit so reusable radar code has no host proxy assumption.
 * Aircraft come from one slow country-wide poll, shared by every radar view, so zooming and panning fetch nothing.
 */
export function useDashboardRadarScene(enabled: boolean, showAirplanes = false): DashboardRadarScene {
  const aircraft = useAircraftRegionQuery(DASHBOARD_AIRCRAFT_REGION, AIRCRAFT_SOURCE, enabled && showAirplanes)
  return { radarSource: enabled ? FMI_RADAR_SOURCE : undefined, airplanes: aircraft.data ?? [] }
}
