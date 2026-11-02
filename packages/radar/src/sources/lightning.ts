import { parseFmiLightningXml, type LightningStrike } from '../lightning'
import { browserRadarTransport, type RadarTransport, withTimeout } from './transport'

export interface FmiLightningRequest { transport?: RadarTransport; signal?: AbortSignal; timeoutMs?: number; now?: Date }
export function getFmiLightningUrl(lat: number, lon: number, deltaMeters = 35000, now = new Date()): string {
  const dLat = (deltaMeters / 111000) * 1.3
  const dLon = (deltaMeters / (111000 * Math.max(.2, Math.cos((lat * Math.PI) / 180)))) * 1.3
  const start = new Date(now.getTime() - 30 * 60 * 1000)
  return `https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::lightning::simple&starttime=${start.toISOString()}&endtime=${now.toISOString()}&bbox=${(lon - dLon).toFixed(4)},${(lat - dLat).toFixed(4)},${(lon + dLon).toFixed(4)},${(lat + dLat).toFixed(4)}`
}
export async function fetchFmiLightning(lat: number, lon: number, deltaMeters = 35000, request: FmiLightningRequest = {}): Promise<LightningStrike[]> {
  try { const now = request.now ?? new Date(); const response = await (request.transport ?? browserRadarTransport).fetch(getFmiLightningUrl(lat, lon, deltaMeters, now), { signal: withTimeout(request.signal, request.timeoutMs ?? 4000), cache: 'no-cache' }); return response.ok ? parseFmiLightningXml(await response.text(), 30, now) : [] } catch { return [] }
}
