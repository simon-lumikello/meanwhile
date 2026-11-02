import { haversineDistanceKm } from './lightning'
import { latLonToWebMercator } from './mercator'
import type { RadarViewArea } from './types'

/** EPSG:3857 circumference in meters. */
export const WEB_MERCATOR_CIRCUMFERENCE = 2 * Math.PI * 6378137
/** MapLibre's world size at zoom 0, in CSS pixels. */
const WORLD_TILE_SIZE = 512

/**
 * A top-down radar camera. Every layer projects through this one snapshot, so
 * basemap, clouds, aircraft, and lightning always agree on the same frame.
 */
export interface RadarCamera {
  /** View center in EPSG:3857 meters. */
  centerX: number
  centerY: number
  /** EPSG:3857 meters per CSS pixel. */
  metersPerPixel: number
  /** Viewport size in CSS pixels. */
  width: number
  height: number
}

/** Camera centered on a location that shows ±`deltaMeters` vertically, as the fixed presets always have. */
export function createHomeCamera(latitude: number, longitude: number, deltaMeters: number, width: number, height: number): RadarCamera {
  const { x, y } = latLonToWebMercator(latitude, longitude)
  const safeHeight = Math.max(1, height)
  return { centerX: x, centerY: y, metersPerPixel: (2 * deltaMeters) / safeHeight, width: Math.max(1, width), height: safeHeight }
}

/** Half of the visible height in EPSG:3857 meters (the preset "±" distance). */
export function getCameraDeltaMeters(camera: RadarCamera): number {
  return (camera.height / 2) * camera.metersPerPixel
}

/** Projects EPSG:3857 meters to viewport CSS pixels. */
export function projectToCamera(camera: RadarCamera, x: number, y: number): { x: number; y: number } {
  return {
    x: (x - camera.centerX) / camera.metersPerPixel + camera.width / 2,
    y: (camera.centerY - y) / camera.metersPerPixel + camera.height / 2,
  }
}

export function projectLatLonToCamera(camera: RadarCamera, latitude: number, longitude: number): { x: number; y: number } {
  const { x, y } = latLonToWebMercator(latitude, longitude)
  return projectToCamera(camera, x, y)
}

export function mapZoomToMetersPerPixel(zoom: number): number {
  return WEB_MERCATOR_CIRCUMFERENCE / (WORLD_TILE_SIZE * 2 ** zoom)
}

export function metersPerPixelToMapZoom(metersPerPixel: number): number {
  return Math.log2(WEB_MERCATOR_CIRCUMFERENCE / (WORLD_TILE_SIZE * metersPerPixel))
}

/** Map zoom that shows ±`deltaMeters` vertically in a viewport `height` CSS pixels tall. */
export function deltaMetersToMapZoom(deltaMeters: number, height: number): number {
  return metersPerPixelToMapZoom((2 * deltaMeters) / Math.max(1, height))
}

/** Inverse of `latLonToWebMercator`, with the same half-circumference constant. */
export function webMercatorToLatLon(x: number, y: number): { latitude: number; longitude: number } {
  const halfCircumference = 20037508.34
  const longitude = (x / halfCircumference) * 180
  const latitude = (Math.atan(Math.exp((y / halfCircumference) * Math.PI)) * 360) / Math.PI - 90
  return { latitude, longitude }
}

/**
 * The ground the camera shows, as a circle around its center that reaches every
 * visible corner. Mercator stretches distances away from the equator, so the
 * corners are measured on the ground rather than in projected meters.
 */
export function getCameraViewArea(camera: RadarCamera): RadarViewArea {
  const center = webMercatorToLatLon(camera.centerX, camera.centerY)
  const halfWidth = (camera.width / 2) * camera.metersPerPixel
  const halfHeight = (camera.height / 2) * camera.metersPerPixel
  let radiusKm = 0
  for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const corner = webMercatorToLatLon(camera.centerX + dx * halfWidth, camera.centerY + dy * halfHeight)
    radiusKm = Math.max(radiusKm, haversineDistanceKm(center.latitude, center.longitude, corner.latitude, corner.longitude))
  }
  return { latitude: center.latitude, longitude: center.longitude, radiusKm }
}

/** Short "±N km" label for a vertical half-extent, in the same units as the zoom presets. */
export function formatRadarRange(deltaMeters: number): string {
  const km = deltaMeters / 1000
  return `±${km >= 9.95 ? Math.round(km) : km.toFixed(1)} km`
}

export interface RadarScaleBar {
  /** Bar length in CSS pixels. */
  widthPx: number
  /** The ground distance the bar spans, such as "5 km" or "500 m". */
  label: string
}

/**
 * A conventional map scale: the longest round ground distance (1, 2, or 5 × 10ⁿ
 * meters) that fits in `maxWidthPx`, measured at the view center, since Mercator
 * stretches distances away from the equator.
 */
export function getCameraScaleBar(camera: RadarCamera, maxWidthPx = 100): RadarScaleBar {
  const { latitude } = webMercatorToLatLon(camera.centerX, camera.centerY)
  const groundMetersPerPixel = camera.metersPerPixel * Math.cos((latitude * Math.PI) / 180)
  const maxMeters = groundMetersPerPixel * maxWidthPx
  const magnitude = 10 ** Math.floor(Math.log10(maxMeters))
  const leading = maxMeters / magnitude
  const meters = (leading >= 5 ? 5 : leading >= 2 ? 2 : 1) * magnitude
  return {
    widthPx: meters / groundMetersPerPixel,
    label: meters >= 1000 ? `${Math.round(meters / 1000)} km` : `${Math.round(meters)} m`,
  }
}

/** True when the camera still shows the home view, within small tolerances. */
export function isCameraAtHome(camera: RadarCamera, home: RadarCamera): boolean {
  const zoomDrift = Math.abs(Math.log2(camera.metersPerPixel / home.metersPerPixel))
  const centerDriftPx = Math.hypot(camera.centerX - home.centerX, camera.centerY - home.centerY) / camera.metersPerPixel
  return zoomDrift < 0.05 && centerDriftPx < Math.max(4, Math.min(camera.width, camera.height) * 0.02)
}
