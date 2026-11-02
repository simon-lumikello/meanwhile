import type { HourlyWeatherPoint } from './weather'

export type WeatherTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type WeatherProviderConfig = Record<string, unknown> & {
  place?: string
  latitude?: number
  longitude?: number
}

/**
 * Explicit request inputs keep provider transport, cancellation, and the clock
 * under the consumer's control.
 */
export interface WeatherForecastRequest {
  date: Date
  config: WeatherProviderConfig
  signal?: AbortSignal
  now?: Date
  transport?: WeatherTransport
}

/** Hourly points for `days` whole local days from `startDate`, for the week outlook. */
export interface WeekForecastRequest {
  startDate: Date
  days: number
  config: WeatherProviderConfig
  signal?: AbortSignal
  now?: Date
  transport?: WeatherTransport
}

export interface WeatherProvider {
  id: string
  name: string
  description: string
  defaultConfig: WeatherProviderConfig
  fetchForecast(request: WeatherForecastRequest): Promise<HourlyWeatherPoint[]>
  /** Longer-range hourly forecast; a provider without one shows no week outlook. */
  fetchWeekForecast?(request: WeekForecastRequest): Promise<HourlyWeatherPoint[]>
}
