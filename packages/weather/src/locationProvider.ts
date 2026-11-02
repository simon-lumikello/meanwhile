import type { WeatherTransport } from './providerTypes'

export interface DetectedLocation {
  name: string
  latitude: number
  longitude: number
  country?: string
  region?: string
  method: 'gps' | 'ip'
}

export interface LocationSearchResult {
  name: string
  country: string
  admin1?: string
  latitude: number
  longitude: number
}

export interface LocationLookupOptions {
  signal?: AbortSignal
  transport?: WeatherTransport
}

async function reverseGeocode(latitude: number, longitude: number, { signal, transport = fetch }: LocationLookupOptions): Promise<Pick<DetectedLocation, 'name' | 'country' | 'region'> | null> {
  try {
    const response = await transport(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`, { signal })
    if (!response.ok) return null
    const data = await response.json() as Record<string, unknown>
    return {
      name: typeof data.city === 'string' ? data.city : typeof data.locality === 'string' ? data.locality : typeof data.principalSubdivision === 'string' ? data.principalSubdivision : 'Detected Location',
      country: typeof data.countryName === 'string' ? data.countryName : undefined,
      region: typeof data.principalSubdivision === 'string' ? data.principalSubdivision : undefined,
    }
  } catch { return null }
}

async function detectViaIp(options: LocationLookupOptions): Promise<DetectedLocation> {
  const response = await (options.transport ?? fetch)('https://freeipapi.com/api/json', { signal: options.signal })
  if (!response.ok) throw new Error(`IP location service returned HTTP ${response.status}`)
  const data = await response.json() as Record<string, unknown>
  const latitude = Number(data.latitude)
  const longitude = Number(data.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('IP location service did not return valid coordinates')
  return {
    name: typeof data.cityName === 'string' ? data.cityName : typeof data.regionName === 'string' ? data.regionName : 'Detected Location',
    latitude: Number(latitude.toFixed(4)), longitude: Number(longitude.toFixed(4)),
    country: typeof data.countryName === 'string' ? data.countryName : undefined,
    region: typeof data.regionName === 'string' ? data.regionName : undefined, method: 'ip',
  }
}

export async function detectUserLocation(options: LocationLookupOptions = {}): Promise<DetectedLocation> {
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }))
      const latitude = position.coords.latitude
      const longitude = position.coords.longitude
      const location = await reverseGeocode(latitude, longitude, options)
      return { name: location?.name || `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`, latitude: Number(latitude.toFixed(4)), longitude: Number(longitude.toFixed(4)), country: location?.country, region: location?.region, method: 'gps' }
    } catch { /* Fall through to the IP lookup. */ }
  }
  try { return await detectViaIp(options) } catch (error: unknown) {
    throw new Error(error instanceof Error ? error.message : 'Unable to detect location. Please check browser permissions or select a hand-picked location.')
  }
}

export async function searchWeatherLocations(query: string, providerId?: string, options: LocationLookupOptions = {}): Promise<LocationSearchResult[]> {
  if (query.length < 2) return []
  const params = new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' })
  if (providerId === 'fmi') { params.set('countryCode', 'FI'); params.set('count', '6') }
  const response = await (options.transport ?? fetch)(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal: options.signal })
  if (!response.ok) return []
  const data = await response.json() as { results?: Array<Record<string, unknown>> }
  return (data.results ?? []).flatMap((result) => {
    if (typeof result.name !== 'string' || typeof result.country !== 'string' || !Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) return []
    return [{ name: result.name, country: result.country, admin1: typeof result.admin1 === 'string' ? result.admin1 : undefined, latitude: Number(result.latitude), longitude: Number(result.longitude) }]
  })
}
