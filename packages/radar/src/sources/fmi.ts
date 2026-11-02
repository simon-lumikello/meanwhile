import type { WindData } from '@simon-lumikello/meanwhile-weather/core'
import { getBoundingBox3857, latLonToWebMercator } from '../core'
import type { RadarFilterMode, RadarFrameSource, RainProximityAlert, SteeringWindRequest, SteeringWindSample } from '../types'
import { browserRadarTransport, type RadarTransport, withTimeout } from './transport'

export const FMI_RADAR_BOUNDS = { minLat: 57.1, maxLat: 70.8, minLon: 15.3, maxLon: 42.7 } as const
export function isWithinFmiRadarCoverage(lat?: number, lon?: number): boolean { return Number.isFinite(lat) && Number.isFinite(lon) && lat! >= FMI_RADAR_BOUNDS.minLat && lat! <= FMI_RADAR_BOUNDS.maxLat && lon! >= FMI_RADAR_BOUNDS.minLon && lon! <= FMI_RADAR_BOUNDS.maxLon }
export function isFmiRadarAvailable(lat?: number, lon?: number): boolean { return isWithinFmiRadarCoverage(lat, lon) }
export function getFmiRadarMapUrl(lat: number, lon: number, deltaMeters = 20000, width = 380, height = 240, style = 'radar_rate', timeIso?: string): string { const bbox = getBoundingBox3857(lat, lon, deltaMeters, width > 0 && height > 0 ? width / height : 1); return `https://openwms.fmi.fi/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Radar:radar_finland_cappi_rate&STYLES=${style}&SRS=EPSG:3857&BBOX=${bbox}&WIDTH=${width}&HEIGHT=${height}&FORMAT=image/png&TRANSPARENT=TRUE${timeIso ? `&TIME=${timeIso}` : ''}` }


const FMI_MIN = latLonToWebMercator(FMI_RADAR_BOUNDS.minLat, FMI_RADAR_BOUNDS.minLon)
const FMI_MAX = latLonToWebMercator(FMI_RADAR_BOUNDS.maxLat, FMI_RADAR_BOUNDS.maxLon)
/** The whole FMI composite in EPSG:3857, rounded outward to whole kilometers. */
export const FMI_RADAR_EXTENT_3857 = [
  Math.floor(FMI_MIN.x / 1000) * 1000,
  Math.floor(FMI_MIN.y / 1000) * 1000,
  Math.ceil(FMI_MAX.x / 1000) * 1000,
  Math.ceil(FMI_MAX.y / 1000) * 1000,
] as const
/** Live frames at ~1.5 km of EPSG:3857 per pixel, finer than the ~1 km ground radar cells at Finnish latitudes. */
const FMI_LIVE_FRAME_WIDTH = 2048
const FMI_PLAYBACK_FRAME_WIDTH = 1024

export interface FmiRadarFrameSourceOptions {
  /** WMS styles for each filter mode. */
  styles?: Partial<Record<RadarFilterMode, string>>
  /** Pressure level, in hPa, of the model winds that steer the radar forecast (default 700). */
  steeringLevelHpa?: FmiSteeringLevel
  /** Network access for the steering winds; frames load as images. */
  transport?: RadarTransport
}

/** MEPS pressure levels FMI publishes. 700 hPa (about 3 km up) carries most rain. */
export type FmiSteeringLevel = 300 | 500 | 700 | 850 | 925 | 1000

/** MEPS point forecasts of wind at one pressure level, several places in one request. */
export function getFmiSteeringWindUrl(request: Pick<SteeringWindRequest, 'points' | 'start' | 'end'>, levelHpa: FmiSteeringLevel = 700): string {
  const points = request.points.map(point => `&latlon=${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`).join('')
  return `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::forecast::meps::pressure::point::simple${points}&level=${levelHpa}&parameters=WindSpeedMS,WindDirection&starttime=${request.start}&endtime=${request.end}&timestep=60`
}

/** Reads MEPS simple features: one element per place, time, and parameter. */
export function parseFmiSteeringWindXml(xml: string): SteeringWindSample[] {
  const readings = new Map<string, Partial<SteeringWindSample>>()
  for (const [element] of xml.matchAll(/<BsWfs:BsWfsElement[\s\S]*?<\/BsWfs:BsWfsElement>/g)) {
    const position = /<gml:pos>\s*([-\d.]+)\s+([-\d.]+)\s*<\/gml:pos>/.exec(element)
    const time = /<BsWfs:Time>([^<]+)<\/BsWfs:Time>/.exec(element)?.[1]
    const name = /<BsWfs:ParameterName>([^<]+)<\/BsWfs:ParameterName>/.exec(element)?.[1]
    const value = Number(/<BsWfs:ParameterValue>([^<]+)<\/BsWfs:ParameterValue>/.exec(element)?.[1])
    if (!position || !time || !Number.isFinite(value)) continue
    const key = `${position[1]},${position[2]},${time}`
    const reading = readings.get(key) ?? { latitude: Number(position[1]), longitude: Number(position[2]), time }
    if (name === 'WindSpeedMS') reading.speedMs = value
    else if (name === 'WindDirection') reading.directionDeg = value
    readings.set(key, reading)
  }
  return [...readings.values()].filter((reading): reading is SteeringWindSample => reading.speedMs !== undefined && reading.directionDeg !== undefined)
}

/**
 * Model winds from FMI's MEPS forecast. One place outside the model domain fails the
 * whole request, so a failed grid is retried at its middle point alone.
 */
export async function fetchFmiSteeringWinds(request: SteeringWindRequest & { transport?: RadarTransport; timeoutMs?: number }, levelHpa: FmiSteeringLevel = 700): Promise<SteeringWindSample[]> {
  const transport = request.transport ?? browserRadarTransport
  const load = async (points: SteeringWindRequest['points']) => {
    const response = await transport.fetch(getFmiSteeringWindUrl({ ...request, points }, levelHpa), { signal: withTimeout(request.signal, request.timeoutMs ?? 8000) })
    return response.ok ? parseFmiSteeringWindXml(await response.text()) : []
  }
  try {
    const samples = await load(request.points)
    if (samples.length || request.points.length <= 1) return samples
    return await load([request.points[Math.floor(request.points.length / 2)]])
  } catch {
    return []
  }
}

/**
 * Whole-coverage FMI radar frames. One image per scan covers every zoom level
 * and pan position, so camera changes never wait for the network. Steering winds
 * for the radar forecast come from FMI's MEPS model.
 */
export function createFmiRadarFrameSource(options: FmiRadarFrameSourceOptions = {}): RadarFrameSource {
  const styles: Record<RadarFilterMode, string> = { clouds: 'radar_rate', rain: 'radar_rate_opera', ...options.styles }
  const [minX, minY, maxX, maxY] = FMI_RADAR_EXTENT_3857
  const aspect = (maxY - minY) / (maxX - minX)
  const steeringLevel = options.steeringLevelHpa ?? 700
  return {
    id: `fmi:${styles.clouds}:${styles.rain}`,
    extent3857: FMI_RADAR_EXTENT_3857,
    attribution: 'Radar © Finnish Meteorological Institute (CC BY 4.0)',
    steeringWinds: request => fetchFmiSteeringWinds({ ...request, transport: options.transport }, steeringLevel),
    frameUrl: ({ time, filterMode, purpose, cacheKey }) => {
      const width = purpose === 'playback' ? FMI_PLAYBACK_FRAME_WIDTH : FMI_LIVE_FRAME_WIDTH
      const height = Math.round(width * aspect)
      const url = `https://openwms.fmi.fi/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Radar:radar_finland_cappi_rate&STYLES=${styles[filterMode]}&SRS=EPSG:3857&BBOX=${minX},${minY},${maxX},${maxY}&WIDTH=${width}&HEIGHT=${height}&FORMAT=image/png&TRANSPARENT=TRUE`
      return `${url}${time ? `&TIME=${time}` : ''}${cacheKey !== undefined && !time ? `&_ts=${encodeURIComponent(String(cacheKey))}` : ''}`
    },
  }
}

export interface FmiRadarRequest { transport?: RadarTransport; signal?: AbortSignal; timeoutMs?: number }
export async function fetchFmiRadarRainRate(lat: number, lon: number, request: FmiRadarRequest = {}): Promise<number | null> {
  if (!isWithinFmiRadarCoverage(lat, lon)) return null
  try { const { x, y } = latLonToWebMercator(lat, lon); const delta = 10000; const bbox = `${Math.round(x - delta)},${Math.round(y - delta)},${Math.round(x + delta)},${Math.round(y + delta)}`; const response = await (request.transport ?? browserRadarTransport).fetch(`https://openwms.fmi.fi/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=Radar:radar_finland_cappi_rate&QUERY_LAYERS=Radar:radar_finland_cappi_rate&BBOX=${bbox}&WIDTH=101&HEIGHT=101&X=50&Y=50&SRS=EPSG:3857&INFO_FORMAT=application/json`, { signal: withTimeout(request.signal, request.timeoutMs ?? 3500), headers: { Accept: 'application/json' } }); if (!response.ok) return null; const data = await response.json(); const value = data?.features?.[0]?.properties?.GRAY_INDEX; return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null } catch { return null }
}
export async function fetchFmiProximityRainAlert(lat: number, lon: number, currentTemp = 15, request: FmiRadarRequest = {}): Promise<RainProximityAlert | null> { const dLat = .09, dLon = .18; const rates = await Promise.all([fetchFmiRadarRainRate(lat, lon, request), fetchFmiRadarRainRate(lat + dLat, lon, request), fetchFmiRadarRainRate(lat - dLat, lon, request), fetchFmiRadarRainRate(lat, lon + dLon, request), fetchFmiRadarRainRate(lat, lon - dLon, request), fetchFmiRadarRainRate(lat + dLat, lon - dLon, request), fetchFmiRadarRainRate(lat - dLat, lon - dLon, request)]); const center = rates[0] ?? 0, nearby = Math.max(0, ...rates.slice(1).map(value => value ?? 0)), type = currentTemp <= 0 ? 'snow' : currentTemp <= 1.5 ? 'sleet' : 'rain', updatedAt = new Date().toISOString(); if (center >= .01) { const severity = center >= 4 ? 'Heavy' : center >= 1 ? 'Moderate' : center < .1 && type === 'rain' ? 'Drizzle' : 'Light'; return { status: 'active', type, intensityMmH: center, summary: `${severity === 'Drizzle' ? severity : `${severity} ${type}`} falling now · ${center < .1 ? '<0.1' : center.toFixed(1)} mm/h`, distanceKm: 0, updatedAt } } return nearby >= .35 ? { status: 'approaching', type, intensityMmH: nearby, summary: `${type.charAt(0).toUpperCase() + type.slice(1)} approaching in ~15–30 min (${nearby.toFixed(1)} mm/h nearby)`, distanceKm: 10, updatedAt } : null }
export async function fetchOpenMeteoWind(lat: number, lon: number, request: FmiRadarRequest = {}): Promise<WindData | null> { try { const response = await (request.transport ?? browserRadarTransport).fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms`, { signal: withTimeout(request.signal, request.timeoutMs ?? 3500), cache: 'no-cache' }); if (!response.ok) return null; const current = (await response.json())?.current; if (typeof current?.wind_speed_10m !== 'number') return null; return { speedMs: Math.round(current.wind_speed_10m * 10) / 10, gustMs: typeof current.wind_gusts_10m === 'number' ? Math.round(current.wind_gusts_10m * 10) / 10 : undefined, directionDeg: typeof current.wind_direction_10m === 'number' ? Math.round(current.wind_direction_10m) : undefined, isStormWarning: (current.wind_gusts_10m ?? current.wind_speed_10m) >= 14 || current.wind_speed_10m >= 14 } } catch { return null } }
