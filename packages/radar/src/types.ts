/** Home view presets, by half the visible height: ±10, ±20, ±35 or ±70 km (`RADAR_ZOOM_METERS`). */
export type RadarZoomLevel = 'local' | 'close' | 'standard' | 'wide'
/** Default size without `mapWidth` / `mapHeight` (640×400 or 440×280 px), and badge and overlay sizing. */
export type RadarWidgetSize = 'standard' | 'compact'
/**
 * Basemap under the radar: Esri's dark gray canvas, OpenStreetMap as published, or
 * OpenStreetMap inverted into a dark map.
 */
export type RadarMapStyle = 'dark-canvas' | 'natural-osm' | 'dark-osm'
/**
 * Which echoes the radar frames show: every cloud echo, faint non-precipitating ones
 * included ('clouds', FMI's `radar_rate`), or only rain from 0.2 mm/h ('rain', FMI's
 * `radar_rate_opera`).
 */
export type RadarFilterMode = 'rain' | 'clouds'
/** Radar drawn as realistic clouds (volumetric on WebGL2, flat on WebGL1), or as a rain intensity heatmap ('radar-blocks'). */
export type RadarRenderMode = 'realistic-clouds' | 'radar-blocks'
/** How much of the map shows through the realistic clouds: none, some, or most of it. */
export type RadarCloudTransparency = 'solid' | 'sheer' | 'see-through'
/** How the sun lights the realistic clouds: as it stands now, sunrise and sunset colours included, or always as at midday. */
export type RadarCloudLighting = 'time-of-day' | 'noon'

/** Rendering and layer choices that consumers may persist in their own settings. */
export interface RadarLayerOptions {
  /** Draws the basemap under the radar (default true); without it the radar sits on the host's background. */
  showBasemap?: boolean
  /** Draws the `airplanes` passed in, with their contrails (default true). */
  showAirplanes?: boolean
  /** Default 'dark-canvas'. 'natural-osm' is dimmed slightly in the dark theme. */
  mapStyle?: RadarMapStyle
  // The four below default as noted. When one is omitted, the map's own settings dialog
  // changes it (uncontrolled); when passed, the host owns it and hears of changes through
  // the matching `on…Change` callback.
  /** Default 'clouds'. */
  filterMode?: RadarFilterMode
  /** Default 'realistic-clouds'. */
  renderMode?: RadarRenderMode
  /** Default 'solid'; 'sheer' and 'see-through' draw the clouds at 70% and 45% opacity. */
  cloudTransparency?: RadarCloudTransparency
  /** Default 'time-of-day'. */
  cloudLighting?: RadarCloudLighting
}

/** What the renderer asks a radar frame source for. */
export interface RadarFrameRequest {
  /** ISO timestamp; omitted for the latest available scan. */
  time?: string
  filterMode: RadarFilterMode
  /** Live frames stay on screen; playback frames stream in quick succession and may be lighter. */
  purpose: 'live' | 'playback'
  /** Changes whenever a fresh latest scan should bypass HTTP caches. */
  cacheKey?: string | number
}

/**
 * A georeferenced radar image provider. Every frame covers the same fixed
 * EPSG:3857 extent, so the renderer can zoom and pan across it without
 * requesting anything new.
 */
export interface RadarFrameSource {
  /** Stable identity; the renderer reloads frames only when it changes. */
  id: string
  /** Covered extent in EPSG:3857 meters: [minX, minY, maxX, maxY]. */
  extent3857: readonly [number, number, number, number]
  frameUrl(request: RadarFrameRequest): string
  /** Attribution shown with the map, if the data license asks for one. */
  attribution?: string
  /**
   * Model winds at the level that steers precipitation, before and after now. The
   * radar forecast uses them to carry echoes forward where the radar alone cannot
   * tell how they move, and to turn with the wind as it is forecast to change.
   * Called only while the timeline shows a forecast.
   */
  steeringWinds?(request: SteeringWindRequest): Promise<SteeringWindSample[]>
}

/** A wind reading at the steering level: where it blows from, like surface wind. */
export interface SteeringWindSample {
  latitude: number
  longitude: number
  /** ISO timestamp. */
  time: string
  speedMs: number
  directionDeg: number
}

/** What the radar forecast asks a source for: winds at these places over this interval. */
export interface SteeringWindRequest {
  points: ReadonlyArray<{ latitude: number; longitude: number }>
  /** ISO timestamps. */
  start: string
  end: string
  signal?: AbortSignal
}

/** Radar-derived precipitation telemetry, independent of forecast providers. */
export interface RainProximityAlert {
  status: 'active' | 'approaching'
  type: 'rain' | 'snow' | 'sleet'
  intensityMmH: number
  summary: string
  distanceKm?: number
  updatedAt: string
}

/** The ground a radar view shows: its center and the distance to its farthest visible corner. */
export interface RadarViewArea {
  latitude: number
  longitude: number
  radiusKm: number
}

/** Provider-neutral aircraft payload supplied to the radar renderer. */
export interface AirplaneData {
  icao24: string
  callsign: string
  originCountry: string
  longitude: number
  latitude: number
  altitude: number
  velocity: number
  trueTrack: number
  /** How fast the track is turning, degrees per second, positive to the right; absent when unknown. */
  trackRate?: number
  category: number
  lastContact: number
}
