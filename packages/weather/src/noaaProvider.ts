import type { AuroraKpPoint } from './aurora'
import type { WeatherTransport } from './providerTypes'

const NOAA_KP_FORECAST_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json'

export interface NoaaKpForecastRequest {
  signal?: AbortSignal
  transport?: WeatherTransport
  now?: Date
}

export function parseSwpcTimeTag(timeTag: string): Date {
  return new Date(timeTag.endsWith('Z') ? timeTag : `${timeTag}Z`)
}

export function parseNoaaKpForecast(data: unknown): AuroraKpPoint[] {
  if (!Array.isArray(data)) throw new Error('Unexpected NOAA SWPC response format')
  return data.map((item: Record<string, unknown>) => ({
    time: typeof item.time_tag === 'string' ? item.time_tag : '',
    kp: typeof item.kp === 'number' ? item.kp : Number(item.kp) || 0,
    observed: item.observed === 'observed' ? 'observed' : 'predicted',
    noaaScale: typeof item.noaa_scale === 'string' ? item.noaa_scale : null,
  }))
}

export async function fetchKpForecast({ signal, transport = fetch }: NoaaKpForecastRequest = {}): Promise<AuroraKpPoint[]> {
  const response = await transport(NOAA_KP_FORECAST_URL, { cache: 'no-cache', signal })
  if (!response.ok) throw new Error(`NOAA SWPC service responded with HTTP ${response.status}`)
  return parseNoaaKpForecast(await response.json())
}

export function resetKpCache(): void {
  // Kept as a harmless compatibility no-op while consumers migrate to QueryClient caching.
}
