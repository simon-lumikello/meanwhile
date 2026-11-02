import { addMinutes, differenceInMinutes, isSameDay, startOfDay } from 'date-fns'
import type { RadarZoomLevel, RainProximityAlert } from './types'
import { latLonToWebMercator } from './mercator'

export type {
  RadarCloudLighting,
  RadarCloudTransparency,
  RadarFilterMode,
  AirplaneData,
  RadarFrameRequest,
  RadarFrameSource,
  RadarLayerOptions,
  RadarMapStyle,
  RadarRenderMode,
  RadarViewArea,
  RadarWidgetSize,
  RadarZoomLevel,
  RainProximityAlert,
  SteeringWindRequest,
  SteeringWindSample,
} from './types'
export type {
  GroundVelocity,
  MotionEstimateOptions,
  MotionVector,
  NowcastExtent,
  NowcastVelocityOptions,
  RadarMotionField,
  RgbaImage,
  SteeringWindModel,
  TracerGrid,
} from './nowcast'
export {
  NOWCAST_ANALYSIS_WIDTH,
  NOWCAST_DEFAULT_MINUTES,
  NOWCAST_FRAME_WIDTH,
  NOWCAST_MOTION_LAG_MINUTES,
  NOWCAST_MOTION_PAIRS,
  NOWCAST_STEP_MINUTES,
  createSteeringWindModel,
  estimateRadarMotion,
  extentFromBounds,
  extentMotionToVelocity,
  extentPositionToLatLon,
  nowcastBlurRadius,
  nowcastDisplacements,
  nowcastForecastTimes,
  nowcastHistoryTimes,
  nowcastVelocity,
  radarMotionEstimation,
  radarTracer,
  renderNowcastFrame,
  sampleMotion,
  steeringWindSamplePoints,
  surfaceWindToSteering,
  velocityToExtentMotion,
  velocityToWind,
  windToVelocity,
} from './nowcast'
export type { LightningStrike, StrikeAgeCategory, ThunderstormStatus } from './lightning'
export {
  calculateBearing,
  classifyStrikeAge,
  evaluateThunderstormStatus,
  getMockThunderstormData,
  haversineDistanceKm,
  parseFmiLightningXml,
  projectStrikeToCanvas,
} from './lightning'

export const RADAR_ZOOM_METERS: Record<RadarZoomLevel, number> = {
  local: 10000,
  close: 20000,
  standard: 35000,
  wide: 70000,
}

export const RADAR_ZOOM_LABELS: Record<RadarZoomLevel, string> = {
  local: '±10 km',
  close: '±20 km',
  standard: '±35 km',
  wide: '±70 km',
}

export function getRadarDeltaMeters(zoom?: RadarZoomLevel | number): number {
  if (typeof zoom === 'number') return zoom
  return zoom ? RADAR_ZOOM_METERS[zoom] : RADAR_ZOOM_METERS.close
}

export { latLonToWebMercator }
export type { RadarCamera, RadarScaleBar } from './camera'
export {
  createHomeCamera,
  deltaMetersToMapZoom,
  formatRadarRange,
  getCameraDeltaMeters,
  getCameraScaleBar,
  getCameraViewArea,
  isCameraAtHome,
  mapZoomToMetersPerPixel,
  metersPerPixelToMapZoom,
  projectLatLonToCamera,
  projectToCamera,
  webMercatorToLatLon,
} from './camera'

export function getBoundingBox3857(lat: number, lon: number, deltaMeters = 20000, aspect = 1): string {
  const { x, y } = latLonToWebMercator(lat, lon)
  const deltaX = Math.round(deltaMeters * aspect)
  return `${Math.round(x - deltaX)},${Math.round(y - deltaMeters)},${Math.round(x + deltaX)},${Math.round(y + deltaMeters)}`
}

export function getAvailableRadarTimestamps(date: Date = new Date(), now = new Date()): string[] {
  const start = startOfDay(date)
  if (date > now && !isSameDay(date, now)) return []
  const end = isSameDay(date, now) ? now : new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  return Array.from({ length: Math.floor(differenceInMinutes(end, start) / 5) + 1 }, (_, index) =>
    addMinutes(start, index * 5).toISOString(),
  )
}

export function getShortRainAlertLabel(alert: RainProximityAlert): string {
  const type = alert.type.toLowerCase()
  if (alert.status === 'approaching') return `${type.charAt(0).toUpperCase() + type.slice(1)} approaching`
  if (alert.intensityMmH < 0.1 && type === 'rain') return 'Drizzle'
  const severity = alert.intensityMmH >= 4 ? 'Heavy' : alert.intensityMmH >= 1 ? 'Moderate' : 'Light'
  return `${severity} ${type}`
}

const CARDINAL_DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const
export function getWindCardinal(deg?: number): string {
  if (deg === undefined || Number.isNaN(deg)) return ''
  return CARDINAL_DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
}
export function getWindFlowRotation(deg?: number): number { return deg === undefined || Number.isNaN(deg) ? 0 : (deg + 180) % 360 }

export interface WindBeaufortInfo { scale: number; label: string; colorClass: string; borderClass: string; bgClass: string }
const BEAUFORT: Array<[number, WindBeaufortInfo]> = [
  [0.3, { scale: 0, label: 'Calm', colorClass: 'text-slate-300', borderClass: 'border-slate-500/30', bgClass: 'bg-slate-800/60' }],
  [1.6, { scale: 1, label: 'Light air', colorClass: 'text-sky-300', borderClass: 'border-sky-500/30', bgClass: 'bg-sky-950/60' }],
  [3.4, { scale: 2, label: 'Light breeze', colorClass: 'text-sky-300', borderClass: 'border-sky-500/30', bgClass: 'bg-sky-950/60' }],
  [5.5, { scale: 3, label: 'Gentle breeze', colorClass: 'text-cyan-300', borderClass: 'border-cyan-500/30', bgClass: 'bg-cyan-950/60' }],
  [8, { scale: 4, label: 'Moderate breeze', colorClass: 'text-teal-300', borderClass: 'border-teal-500/30', bgClass: 'bg-teal-950/60' }],
  [10.8, { scale: 5, label: 'Fresh breeze', colorClass: 'text-emerald-300', borderClass: 'border-emerald-500/30', bgClass: 'bg-emerald-950/60' }],
  [13.9, { scale: 6, label: 'Strong breeze', colorClass: 'text-amber-300', borderClass: 'border-amber-500/30', bgClass: 'bg-amber-950/60' }],
  [17.2, { scale: 7, label: 'Near gale', colorClass: 'text-orange-400', borderClass: 'border-orange-500/40', bgClass: 'bg-orange-950/70' }],
  [20.8, { scale: 8, label: 'Gale', colorClass: 'text-rose-400', borderClass: 'border-rose-500/50', bgClass: 'bg-rose-950/70' }],
]
export function getWindBeaufort(speedMs: number): WindBeaufortInfo {
  return BEAUFORT.find(([limit]) => speedMs < limit)?.[1] ?? { scale: 9, label: 'Storm', colorClass: 'text-red-400 animate-pulse', borderClass: 'border-red-500/60', bgClass: 'bg-red-950/80' }
}

export type RadarHorizontalPosition = 'left' | 'right'
export interface RadarPlacementParams { playheadPercent: number | null; orientation?: 'horizontal' | 'vertical'; radarSize?: 'standard' | 'compact'; windowWidth: number; headerWidth?: number; safetyGap?: number; leftMargin?: number }
export function calculateRadarPlacement({ playheadPercent, orientation = 'horizontal', radarSize = 'standard', windowWidth, headerWidth = windowWidth >= 768 ? 208 : 48, safetyGap = 20, leftMargin = 12 }: RadarPlacementParams) {
  if (playheadPercent === null || orientation !== 'horizontal') return { position: 'right' as const, availableSpace: 0, requiredSpace: 0 }
  const availableSpace = Math.max(0, windowWidth - headerWidth) * (playheadPercent / 100)
  const requiredSpace = leftMargin + Math.min(radarSize === 'compact' ? 440 : 640, Math.max(200, windowWidth - 24)) + safetyGap
  return { position: availableSpace >= requiredSpace ? 'left' as const : 'right' as const, availableSpace, requiredSpace }
}

export interface RadarTimelineTick { label?: string; pct: number; isMajor: boolean }
/** Labels keep this far (in percent of the track) from the start, from Now, and from a forecast's end. */
const TICK_LABEL_START_GAP = 12
const TICK_LABEL_NOW_GAP = 14
/**
 * Clock ticks along a timeline of evenly spaced scans. `nowIndex` is the latest
 * observed scan; frames after it are forecast. Without it, the last scan is Now.
 */
export function calculateRadarTimelineTicks(timestamps: string[], nowIndex = timestamps.length - 1): RadarTimelineTick[] {
  if (!timestamps.length) return []
  const start = new Date(timestamps[0]); const end = new Date(timestamps.at(-1)!)
  const totalMs = end.getTime() - start.getTime(); if (totalMs <= 0) return [{ label: 'Now', pct: 100, isMajor: true }]
  const nowPct = ((new Date(timestamps[Math.min(Math.max(0, nowIndex), timestamps.length - 1)]).getTime() - start.getTime()) / totalMs) * 100
  const totalHours = totalMs / 3_600_000; const majorStep = totalHours <= 3 ? 1 : totalHours <= 6 ? 2 : totalHours <= 12 ? 3 : 6; const minorStep = totalHours <= 3 ? .5 : totalHours <= 6 ? 1 : totalHours <= 12 ? 1 : 3
  const ticks: RadarTimelineTick[] = []
  const day = startOfDay(start)
  // Hours counted from the first scan's local midnight, so ticks fall on the clock and run past midnight.
  for (let h = 0; ; h += minorStep) {
    const time = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(h), Math.round((h % 1) * 60))
    if (time > end) break
    if (time < start) continue
    const pct = ((time.getTime() - start.getTime()) / totalMs) * 100
    const isMajor = Math.abs(h % majorStep) < .001
    const clock = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
    const labelled = pct === 0 || (isMajor && pct >= TICK_LABEL_START_GAP && Math.abs(pct - nowPct) >= TICK_LABEL_NOW_GAP && pct <= 100 - TICK_LABEL_START_GAP)
    ticks.push({ pct, isMajor, label: labelled ? clock : undefined })
  }
  ticks.push({ label: 'Now', pct: nowPct, isMajor: true })
  return ticks.sort((a, b) => a.pct - b.pct)
}
