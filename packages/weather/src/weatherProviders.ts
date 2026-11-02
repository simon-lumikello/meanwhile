import type { WeatherProvider } from './providerTypes'
import { fmiWeatherProvider } from './fmiProvider'
import { openMeteoWeatherProvider } from './openMeteoProvider'

export const WEATHER_PROVIDERS: Record<string, WeatherProvider> = {
  fmi: fmiWeatherProvider,
  'open-meteo': openMeteoWeatherProvider,
}

export function getWeatherProvider(id?: string): WeatherProvider {
  if (id && WEATHER_PROVIDERS[id]) {
    return WEATHER_PROVIDERS[id]
  }
  return fmiWeatherProvider
}
