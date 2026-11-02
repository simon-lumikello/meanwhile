import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Radar,
  Droplet,
  History,
  Settings as SettingsIcon,
  Zap,
} from 'lucide-react'
import { Button } from '@simon-lumikello/meanwhile-ui/react'
import { NOWCAST_DEFAULT_MINUTES, RADAR_ZOOM_METERS, getAvailableRadarTimestamps, getWindCardinal } from './core'
import { createHomeCamera,getCameraScaleBar, getCameraViewArea, projectLatLonToCamera } from './camera'
import type {
  RadarCloudLighting,
  RadarCloudTransparency,
  RadarFilterMode,
  RadarFrameSource,
  RadarLayerOptions,
  RadarMapStyle,
  RadarRenderMode,
  RadarViewArea,
  RadarWidgetSize,
  RadarZoomLevel,
} from './types'
import { CloudRadarCanvas, type RadarForecastFrames, type RadarLayerStatus } from './CloudRadarCanvas'
import { RadarPlaybackToolbar, type RadarForecastStatus } from './RadarPlaybackToolbar'
import { useRadarNowcast } from './useRadarNowcast'
import { AuroraRadarCanvas } from './AuroraRadarCanvas'
import { RadarBasemapCanvas } from './RadarBasemapCanvas'
import { RadarWindBadge } from './RadarWindBadge'
import { AirplaneCanvas, type AirplaneHover } from './AirplaneCanvas'
import { LightningRadarCanvas } from './LightningRadarCanvas'
import { RadarFrameLoop } from './RadarFrameLoop'
import { RadarSettingsDialog, type RadarOverlaySettings } from './RadarSettingsDialog'
import type { RadarMapHandle } from './radarMap'
import type { ThunderstormStatus } from './lightning'
import type { AirplaneData } from './types'

/** Layer choices (`showBasemap`, `mapStyle`, `renderMode`, `filterMode`, …) are documented on `RadarLayerOptions`. */
export interface RadarViewportProps extends RadarLayerOptions {
  /** The observer: the home view's center, and where the sun, moon and wind are worked out for. */
  latitude: number
  longitude: number
  /** Dark theme (default true): darker basemap filters, night cloud colours, and dimmer clouds. */
  isDark?: boolean
  /** Enables map gestures (wheel and pinch zoom, drag, double-click) and the controls. */
  interactive?: boolean
  /** Home view: the preset the map opens at and returns to (default 'close'). */
  radarZoom?: RadarZoomLevel
  /** Default 'standard'. */
  radarSize?: RadarWidgetSize
  /** How much of the map shows through the realistic clouds; chosen in the map settings dialog. */
  cloudTransparency?: RadarCloudTransparency
  /** Whether the realistic clouds follow the sun through the day or stay lit as at midday; chosen in the map settings dialog. */
  cloudLighting?: RadarCloudLighting
  /** Extra opacity factor for the realistic clouds (0–1), applied on top of `cloudTransparency`. */
  cloudOpacity?: number
  /**
   * Surface wind at the observer, shown in the wind badge. It also sets the direction and
   * speed the clouds and contrails drift, and seeds the radar forecast's motion. Without
   * it the clouds drift gently on their own.
   */
  windSpeedMs?: number
  windGustMs?: number
  /** Where the wind blows from, in degrees, as meteorology reports it. */
  windDirectionDeg?: number
  /** Rain rate at the observer, in mm/h, shown as a badge when above zero. */
  rainRate?: number | null
  /**
   * Georeferenced radar frames. The viewport requests the latest scan (and playback
   * scans) itself; camera changes never trigger a request.
   */
  radarSource?: RadarFrameSource
  /** How often the latest scan is refreshed, in milliseconds (default 5 minutes; 0 never refreshes). */
  radarRefreshMs?: number
  /** Aircraft to draw when `showAirplanes` is on; positions are extrapolated between updates. */
  airplanes?: AirplaneData[]
  /**
   * Called with the visible area once the map settles after loading, zooming, or
   * panning, for hosts whose data depends on the view.
   */
  onViewAreaChange?: (area: RadarViewArea) => void
  /** Fixed size in pixels. Without it the viewport fills its container. */
  mapWidth?: number
  mapHeight?: number
  /** Shows the control bar (default true) when any control below, or the timeline, is on. */
  showControls?: boolean
  /** Offers the renderer choice in the map settings dialog. */
  showRenderModeToggle?: boolean
  /** Shows a map scale bar in the bottom-left corner. */
  showScale?: boolean
  /** Offers the cloud filter in the map settings dialog. */
  showFilterControl?: boolean
  /** Offers the cloud transparency choice in the map settings dialog. */
  showCloudTransparencyControl?: boolean
  /** Offers the cloud lighting choice in the map settings dialog. */
  showCloudLightingControl?: boolean
  /**
   * Opens the host's own settings dialog from the map's Settings button instead of the
   * map's dialog, so an app has one settings UI. Put `RadarSettingsFields` in that dialog
   * and pass the overlay choices back as controlled props (`renderMode`, `filterMode`,
   * `cloudTransparency`, `cloudLighting`).
   */
  onOpenSettings?: () => void
  /** Shows the rain-rate legend (default true); only the heatmap has one. */
  showLegend?: boolean
  /** Labels the center crosshairs N, E, S and W (default true). */
  showCardinalDirections?: boolean
  /** Draws aurora over the map and an Aurora badge (default false). */
  hasActiveAurora?: boolean
  /** Kp index: shown on the aurora badge, and brightens the aurora (Kp 4 is normal strength). */
  auroraKp?: number
  /** Recent lightning: strikes flash on the map, and an active storm shows a badge with the nearest strike. */
  thunderstorm?: ThunderstormStatus
  /** Host content for the top-right corner, beside the map credits. */
  topRightSlot?: React.ReactNode
  className?: string
  /** Inline sizing supplied by an embedding host. */
  style?: React.CSSProperties
  /** Eases back to the home view after this long without a map gesture. */
  autoRecenterMs?: number
  /** @deprecated The zoom preset button is gone; wheel and pinch zoom freely. Never called. */
  onCycleZoom?: (nextZoom?: RadarZoomLevel) => void
  /** @deprecated The zoom preset button is gone; wheel and pinch zoom freely. Never called. */
  onZoomChange?: (nextZoom: RadarZoomLevel) => void
  onToggleClouds?: (nextMode?: RadarRenderMode) => void
  onToggleFilter?: (nextMode?: RadarFilterMode) => void
  onRenderModeChange?: (nextMode: RadarRenderMode) => void
  onFilterChange?: (nextMode: RadarFilterMode) => void
  onCloudTransparencyChange?: (next: RadarCloudTransparency) => void
  onCloudLightingChange?: (next: RadarCloudLighting) => void
  /** Offers the timeline on interactive maps: today's scans and the forecast after them. */
  showTimeline?: boolean
  /** How far ahead the timeline forecasts, in minutes; 0 shows scans only. */
  forecastMinutes?: number
  /** The scans the timeline plays, oldest first, every five minutes. Defaults to today's. */
  timelineTimestamps?: string[]
}

/** Longest the map scale bar grows, in CSS pixels. */
const SCALE_BAR_MAX_PX = 96
/** Quiet time after a move before the visible area is reported. */
const VIEW_AREA_SETTLE_MS = 400
/** Pointer travel that still counts as a click on an aircraft rather than a drag. */
const CLICK_TOLERANCE_PX = 5
/** The timeline closes after this long without any input, returning a wall display to live. */
const TIMELINE_IDLE_MS = 5 * 60 * 1000
/** Latest scans tried as the forecast's starting point; the newest may still be processing. */
const FORECAST_BASE_CANDIDATES = 4
const NO_TIMESTAMPS: string[] = []

/** How old the preloaded forecast may get before it is redone. */
const FORECAST_REFRESH_MS = 10 * 60 * 1000
/** How often a visible tab checks whether the forecast is due. */
const FORECAST_CHECK_MS = 60 * 1000

/** The cloud opacity each transparency choice draws at. */
const CLOUD_TRANSPARENCY_OPACITY: Record<RadarCloudTransparency, number> = {
  solid: 1,
  sheer: 0.7,
  'see-through': 0.45,
}

/** Heatmap legend rows. All-clouds frames are redrawn in the renderer's palette; rain-only frames keep FMI's. */
const LEGEND_ROWS = {
  clouds: [
    { label: 'Clouds / Aloft', range: '< 0.2', dot: 'bg-slate-200', text: 'text-slate-200' },
    { label: 'Light Rain', range: '0.2 – 1', dot: 'bg-sky-400', text: 'text-sky-300' },
    { label: 'Moderate Rain', range: '1 – 5', dot: 'bg-indigo-500', text: 'text-indigo-300' },
    { label: 'Heavy Rain', range: '5 – 15', dot: 'bg-fuchsia-500', text: 'text-fuchsia-300' },
    { label: 'Downpour', range: '> 15', dot: 'bg-orange-400', text: 'text-orange-300' },
  ],
  rain: [
    { label: 'Light Rain', range: '0.2 – 1', dot: 'bg-blue-500', text: 'text-blue-300' },
    { label: 'Moderate Rain', range: '1 – 5', dot: 'bg-emerald-400', text: 'text-emerald-300' },
    { label: 'Heavy Rain', range: '5 – 15', dot: 'bg-amber-400', text: 'text-amber-300' },
    { label: 'Downpour', range: '> 15', dot: 'bg-rose-500', text: 'text-rose-300' },
  ],
} as const

type MapStatus = 'loading' | 'ready' | 'failed'

function openAircraftPage(plane: AirplaneData) {
  // Commercial flights typically broadcast 3-letter ICAO airline codes followed by numbers (e.g., FIN42)
  // Private planes broadcast their tail registration (e.g., OH123, N12345, DEABC)
  const isCommercial = plane.callsign && /^[A-Z]{3}\d+[A-Z]*$/i.test(plane.callsign)
  window.open(
    isCommercial ? `https://www.radarbox.com/data/flights/${plane.callsign}` : `https://globe.adsb.lol/?icao=${plane.icao24}`,
    '_blank',
  )
}

function basemapFilter(mapStyle: RadarMapStyle, isDark: boolean): string {
  if (mapStyle === 'dark-osm') return 'invert(100%) hue-rotate(180deg) brightness(0.70) contrast(1.2) saturate(0.85)'
  if (mapStyle === 'natural-osm' && isDark) return 'brightness(0.85) contrast(1.05)'
  return '' // 'dark-canvas' is naturally dark
}

export const RadarViewport: React.FC<RadarViewportProps> = ({
  latitude,
  longitude,
  isDark = true,
  interactive = false,
  showBasemap: propShowBasemap,
  showAirplanes = true,
  mapStyle: propMapStyle,
  radarZoom: propRadarZoom,
  radarSize: propRadarSize,
  filterMode: propFilterMode,
  renderMode: propRenderMode,
  cloudTransparency: propCloudTransparency,
  cloudLighting: propCloudLighting,
  cloudOpacity = 1,
  windSpeedMs,
  windGustMs,
  windDirectionDeg,
  rainRate,
  radarSource,
  radarRefreshMs,
  airplanes = [],
  onViewAreaChange,
  mapWidth: propMapWidth,
  mapHeight: propMapHeight,
  showControls = true,
  showRenderModeToggle = true,
  showScale = true,
  showFilterControl = true,
  showCloudTransparencyControl = true,
  showCloudLightingControl = true,
  onOpenSettings,
  showLegend = true,
  showCardinalDirections = true,
  hasActiveAurora = false,
  auroraKp,
  thunderstorm,
  topRightSlot,
  className = '',
  style,
  autoRecenterMs,
  onToggleClouds,
  onToggleFilter,
  onRenderModeChange,
  onFilterChange,
  onCloudTransparencyChange,
  onCloudLightingChange,
  showTimeline = true,
  forecastMinutes = NOWCAST_DEFAULT_MINUTES,
  timelineTimestamps,
}) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number } | null>(null)
  const [radarStatus, setRadarStatus] = useState<RadarLayerStatus>('loading')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const element = rootRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const update = (width: number, height: number) => {
      if (width > 0 && height > 0) setMeasuredSize(previous => previous?.width === width && previous.height === height ? previous : { width, height })
    }
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) update(Math.round(rect.width), Math.round(rect.height))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Resolve preferences directly from props or defaults
  const showBasemap = propShowBasemap ?? true
  const currentMapStyle: RadarMapStyle = propMapStyle ?? 'dark-canvas'
  const currentZoom: RadarZoomLevel = propRadarZoom ?? 'close'
  const currentSize: RadarWidgetSize = (propRadarSize ?? 'standard') as RadarWidgetSize
  const isCompact = currentSize === 'compact'

  const [uncontrolledFilterMode, setUncontrolledFilterMode] = useState<RadarFilterMode>(
    propFilterMode ?? 'clouds',
  )
  const activeFilterMode = propFilterMode ?? uncontrolledFilterMode
  const isRainOnly = activeFilterMode === 'rain'
  const [uncontrolledRenderMode, setUncontrolledRenderMode] = useState<RadarRenderMode>(
    propRenderMode ?? 'realistic-clouds',
  )
  const activeRenderMode = propRenderMode ?? uncontrolledRenderMode
  const [spacePreviewHeld, setSpacePreviewHeld] = useState(false)
  const selectedClouds = activeRenderMode === 'realistic-clouds'
  const useClouds = interactive && spacePreviewHeld ? !selectedClouds : selectedClouds
  const [uncontrolledCloudTransparency, setUncontrolledCloudTransparency] = useState<RadarCloudTransparency>(
    propCloudTransparency ?? 'solid',
  )
  const activeCloudTransparency = propCloudTransparency ?? uncontrolledCloudTransparency
  const cloudTransparencyOpacity = CLOUD_TRANSPARENCY_OPACITY[activeCloudTransparency] ?? CLOUD_TRANSPARENCY_OPACITY.solid
  const [uncontrolledCloudLighting, setUncontrolledCloudLighting] = useState<RadarCloudLighting>(
    propCloudLighting ?? 'time-of-day',
  )
  const activeCloudLighting = propCloudLighting ?? uncontrolledCloudLighting
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const showSettingsControl = interactive && Boolean(onOpenSettings || showRenderModeToggle || showFilterControl || showCloudTransparencyControl || showCloudLightingControl)
  const openSettings = () => {
    if (onOpenSettings) onOpenSettings()
    else setIsSettingsOpen(true)
  }

  const deltaMeters = RADAR_ZOOM_METERS[currentZoom]

  const windSpeed = windSpeedMs ?? null
  const windGust = windGustMs ?? null
  const windDir = windDirectionDeg ?? null

  // ---------------------------------------------------------------------------
  // Timeline: today's scans play at once; the forecast joins them once computed.
  // ---------------------------------------------------------------------------
  const [timelineRequested, setTimelineRequested] = useState(false)
  const [playbackTime, setPlaybackTime] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(600)
  const canShowTimeline = showTimeline && interactive && Boolean(radarSource)
  const timelineOpen = timelineRequested && canShowTimeline

  const closeTimeline = useCallback(() => {
    setTimelineRequested(false)
    setIsPlaying(false)
    setPlaybackTime(null)
  }, [])

  // A wall display left on the timeline returns to live after a quiet period.
  useEffect(() => {
    if (!timelineOpen) return
    let timeout: ReturnType<typeof setTimeout> | undefined
    const resetTimer = () => {
      clearTimeout(timeout)
      timeout = setTimeout(closeTimeline, TIMELINE_IDLE_MS)
    }
    resetTimer()
    const events = ['mousemove', 'keydown', 'touchstart', 'pointerdown'] as const
    events.forEach(type => window.addEventListener(type, resetTimer, { passive: true }))
    return () => {
      clearTimeout(timeout)
      events.forEach(type => window.removeEventListener(type, resetTimer))
    }
  }, [timelineOpen, closeTimeline])

  // The forecast is prepared in the background while the timeline is offered, and redone
  // every FORECAST_REFRESH_MS; a hidden tab catches up when it is shown again.
  const forecastWanted = canShowTimeline && forecastMinutes > 0
  const [forecastClock, setForecastClock] = useState(() => Date.now())
  useEffect(() => {
    if (!forecastWanted) return
    let refreshedAt = Date.now()
    const refreshIfStale = () => {
      if (document.visibilityState === 'hidden' || Date.now() - refreshedAt < FORECAST_REFRESH_MS) return
      refreshedAt = Date.now()
      setForecastClock(refreshedAt)
    }
    const timer = setInterval(refreshIfStale, FORECAST_CHECK_MS)
    document.addEventListener('visibilitychange', refreshIfStale)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfStale)
    }
  }, [forecastWanted])

  // Fixed between refreshes, so the forecast is not restarted as the clock moves on.
  const history = useMemo(
    () => (canShowTimeline ? timelineTimestamps ?? getAvailableRadarTimestamps(new Date(forecastClock)) : NO_TIMESTAMPS),
    [canShowTimeline, timelineTimestamps, forecastClock],
  )
  const baseCandidates = useMemo(() => history.slice(-FORECAST_BASE_CANDIDATES).reverse(), [history])
  const nowcastState = useRadarNowcast({
    enabled: forecastWanted,
    source: radarSource,
    filterMode: activeFilterMode,
    candidates: baseCandidates,
    minutes: forecastMinutes,
    latitude,
    longitude,
    surfaceWind: windSpeedMs !== undefined && windDirectionDeg !== undefined ? { speedMs: windSpeedMs, directionDeg: windDirectionDeg } : undefined,
  })
  const nowcast = nowcastState.status === 'ready' ? nowcastState.nowcast : null

  // Scans up to the forecast's base (later ones are not published yet), then the forecast.
  const timeline = useMemo(() => {
    if (!nowcast) return { timestamps: history, nowIndex: history.length - 1, forecast: undefined }
    const base = Date.parse(nowcast.baseTime)
    const observed = history.filter(time => Date.parse(time) <= base)
    const forecast: RadarForecastFrames = { startIndex: observed.length, frames: nowcast.frames }
    return { timestamps: [...observed, ...nowcast.times], nowIndex: observed.length - 1, forecast }
  }, [history, nowcast])

  const forecastStatus: RadarForecastStatus = nowcastState.status === 'off' ? 'off' : nowcastState.status
  const forecastCaption = nowcast?.motion && nowcast.motion.speedMs >= 0.5
    ? `To ${getWindCardinal((nowcast.motion.directionDeg + 180) % 360)} · ${Math.round(nowcast.motion.speedMs * 3.6)} km/h`
    : undefined

  const defaultWidth = isCompact ? 440 : 640
  const defaultHeight = isCompact ? 280 : 400
  const resolvedWidth = measuredSize?.width ?? propMapWidth ?? defaultWidth
  const resolvedHeight = measuredSize?.height ?? propMapHeight ?? defaultHeight

  // ---------------------------------------------------------------------------
  // Camera: one frame loop drives every layer. The map owns the camera once it
  // loads; until then (or without WebGL) the layers render the home view.
  // ---------------------------------------------------------------------------
  const [loop] = useState(() => new RadarFrameLoop(createHomeCamera(latitude, longitude, deltaMeters, resolvedWidth, resolvedHeight)))
  const mapHandleRef = useRef<RadarMapHandle | null>(null)
  // A held comparison belongs to the focused map, never to the host's preferences.
  useEffect(() => {
    const container = mapContainerRef.current
    if (!interactive || !container) return
    const releasePreview = () => setSpacePreviewHeld(false)
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.isComposing ||
        event.target !== mapHandleRef.current?.map.getCanvas() ||
        event.target !== document.activeElement) return
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) setSpacePreviewHeld(true)
    }
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.target !== mapHandleRef.current?.map.getCanvas()) return
      event.preventDefault()
      event.stopPropagation()
      releasePreview()
    }
    const visibilityChanged = () => {
      if (document.visibilityState === 'hidden') releasePreview()
    }
    container.addEventListener('keydown', keyDown)
    container.addEventListener('keyup', keyUp)
    container.addEventListener('blur', releasePreview, true)
    window.addEventListener('blur', releasePreview)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      container.removeEventListener('keydown', keyDown)
      container.removeEventListener('keyup', keyUp)
      container.removeEventListener('blur', releasePreview, true)
      window.removeEventListener('blur', releasePreview)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [interactive])

  const [mapStatus, setMapStatus] = useState<MapStatus>('loading')
  const homeRef = useRef({ latitude, longitude, deltaMeters })
  const attributionRef = useRef(radarSource?.attribution)
  const attributionHostRef = useRef<HTMLDivElement>(null)
  const userMovedRef = useRef(false)
  const gestureRef = useRef(false)
  const [userMoved, setUserMoved] = useState(false)
  const [gestureCount, setGestureCount] = useState(0)

  const onViewAreaChangeRef = useRef(onViewAreaChange)
  useEffect(() => { onViewAreaChangeRef.current = onViewAreaChange }, [onViewAreaChange])

  const goHome = useCallback((durationMs?: number) => {
    userMovedRef.current = false
    setUserMoved(false)
    // An in-flight wheel or drag gesture must not claim the ease home as a user move.
    gestureRef.current = false
    mapHandleRef.current?.easeTo(homeRef.current, durationMs)
  }, [])

  // Create the map lazily; the engine is a separate chunk.
  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) return
    let cancelled = false
    let handle: RadarMapHandle | null = null
    let viewAreaTimer: ReturnType<typeof setTimeout> | null = null

    import('./radarMap')
      .then(({ createRadarMap }) => {
        if (cancelled) return
        try {
          handle = createRadarMap({
            container,
            view: homeRef.current,
            interactive,
            attribution: attributionRef.current,
            attributionContainer: attributionHostRef.current ?? undefined,
          })
        } catch (error) {
          console.warn('[RadarViewport] Map unavailable, showing a fixed view:', error)
          setMapStatus('failed')
          return
        }
        const map = handle.map
        mapHandleRef.current = handle
        // Overlays draw inside the map's own render, in the same frame as the basemap.
        map.on('render', () => { if (handle) loop.tick(performance.now(), handle.readCamera()) })
        loop.attachDriver(() => map.triggerRepaint())
        // Wheel zoom and inertia reach 'movestart' without an original event, so user
        // gestures are recognised on the container; programmatic easing never sets this.
        const startGesture = () => { gestureRef.current = true }
        const endPointerGesture = () => { if (!map.isMoving()) gestureRef.current = false }
        const gestureEvents = ['wheel', 'pointerdown', 'touchstart', 'keydown', 'dblclick'] as const
        gestureEvents.forEach(type => container.addEventListener(type, startGesture, { capture: true, passive: true }))
        container.addEventListener('pointerup', endPointerGesture, { capture: true })
        map.on('movestart', event => {
          if (!event.originalEvent && !gestureRef.current) return
          userMovedRef.current = true
          setUserMoved(true)
        })
        // The visible area is reported once the view settles, not on every frame of a zoom.
        const reportViewArea = () => {
          if (viewAreaTimer !== null) clearTimeout(viewAreaTimer)
          viewAreaTimer = setTimeout(() => {
            viewAreaTimer = null
            if (handle && !cancelled) onViewAreaChangeRef.current?.(getCameraViewArea(handle.readCamera()))
          }, VIEW_AREA_SETTLE_MS)
        }
        map.on('moveend', event => {
          if (event.originalEvent || gestureRef.current) setGestureCount(count => count + 1)
          gestureRef.current = false
          reportViewArea()
        })
        map.once('remove', () => {
          gestureEvents.forEach(type => container.removeEventListener(type, startGesture, { capture: true }))
          container.removeEventListener('pointerup', endPointerGesture, { capture: true })
        })
        // Tile hiccups are routine for a wall display; keep them out of the console.
        map.on('error', () => {})
        map.once('load', () => {
          if (cancelled) return
          setMapStatus('ready')
          reportViewArea()
        })
      })
      .catch(error => {
        if (cancelled) return
        console.warn('[RadarViewport] Map engine failed to load:', error)
        setMapStatus('failed')
      })

    return () => {
      cancelled = true
      if (viewAreaTimer !== null) clearTimeout(viewAreaTimer)
      loop.detachDriver()
      handle?.destroy()
      mapHandleRef.current = null
      userMovedRef.current = false
    }
  }, [interactive, loop])

  // Home changes (location or preset) ease the map there.
  useEffect(() => {
    const previous = homeRef.current
    homeRef.current = { latitude, longitude, deltaMeters }
    if (previous.latitude === latitude && previous.longitude === longitude && previous.deltaMeters === deltaMeters) return
    goHome()
  }, [latitude, longitude, deltaMeters, goHome])

  // Until the map is ready, the layers render the home view directly.
  useEffect(() => {
    if (mapStatus !== 'ready') loop.setCamera(createHomeCamera(latitude, longitude, deltaMeters, resolvedWidth, resolvedHeight))
  }, [loop, mapStatus, latitude, longitude, deltaMeters, resolvedWidth, resolvedHeight])

  // A resized viewport keeps showing the home extent until the user moves the map.
  // Home changes are eased above; only size changes snap.
  useEffect(() => {
    if (mapStatus !== 'ready') return
    mapHandleRef.current?.map.resize()
    if (!userMovedRef.current) mapHandleRef.current?.jumpTo(homeRef.current)
  }, [mapStatus, resolvedWidth, resolvedHeight])

  // A right-click on the map eases it back to the home location.
  useEffect(() => {
    const container = mapContainerRef.current
    if (!interactive || !container) return
    const recenter = (event: MouseEvent) => {
      event.preventDefault()
      goHome()
    }
    container.addEventListener('contextmenu', recenter)
    return () => container.removeEventListener('contextmenu', recenter)
  }, [interactive, goHome])

  // Basemap layers, plus the look of the map canvas.
  useEffect(() => {
    const handle = mapHandleRef.current
    if (!handle || mapStatus === 'failed') return
    handle.setBasemap(currentMapStyle, showBasemap)
    const canvas = handle.map.getCanvas()
    canvas.style.filter = basemapFilter(currentMapStyle, isDark)
    canvas.style.opacity = '0.85'
  }, [mapStatus, currentMapStyle, showBasemap, isDark])

  // Return home after a quiet period.
  useEffect(() => {
    if (!userMoved || !autoRecenterMs) return
    const timer = setTimeout(() => goHome(1200), autoRecenterMs)
    return () => clearTimeout(timer)
  }, [userMoved, autoRecenterMs, gestureCount, goHome])

  // Scale bar and home pin follow the camera without re-rendering per frame.
  const pinLocationRef = useRef({ latitude, longitude })
  const scaleBarRef = useRef<HTMLDivElement>(null)
  const scaleLabelRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    pinLocationRef.current = { latitude, longitude }
    loop.request()
  }, [loop, latitude, longitude])
  useEffect(() => loop.subscribe(({ camera }) => {
    const scale = getCameraScaleBar(camera, SCALE_BAR_MAX_PX)
    if (scaleBarRef.current) scaleBarRef.current.style.width = `${scale.widthPx.toFixed(1)}px`
    if (scaleLabelRef.current && scaleLabelRef.current.textContent !== scale.label) scaleLabelRef.current.textContent = scale.label
    const pin = pinRef.current
    if (pin) {
      const { x, y } = projectLatLonToCamera(camera, pinLocationRef.current.latitude, pinLocationRef.current.longitude)
      pin.style.transform = `translate(${x}px, ${y}px)`
    }
  }), [loop])

  // Aircraft hover and click, without taking gestures away from the map.
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)
  const hoveredPlaneRef = useRef<AirplaneData | null>(null)
  const handleAirplaneHover = useCallback((hover: AirplaneHover | null) => {
    const plane = hover?.plane ?? null
    if (plane === hoveredPlaneRef.current) return
    hoveredPlaneRef.current = plane
    const container = mapHandleRef.current?.map.getCanvasContainer()
    if (container) container.style.cursor = plane ? 'pointer' : ''
  }, [])
  const isOnMap = (target: EventTarget) => target instanceof Node && Boolean(mapContainerRef.current?.contains(target))
  const handlePointerMove = (event: React.PointerEvent) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    loop.request()
  }
  const handlePointerLeave = () => {
    pointerRef.current = null
    loop.request()
  }
  const handlePointerDown = (event: React.PointerEvent) => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY }
  }
  const handleClick = (event: React.MouseEvent) => {
    const plane = hoveredPlaneRef.current
    const down = pointerDownRef.current
    if (!plane || !isOnMap(event.target)) return
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX) return
    openAircraftPage(plane)
  }

  const setRenderMode = (next: RadarRenderMode) => {
    if (onRenderModeChange) onRenderModeChange(next)
    else if (onToggleClouds) onToggleClouds(next)
    else setUncontrolledRenderMode(next)
  }

  const setFilterMode = (next: RadarFilterMode) => {
    if (onFilterChange) onFilterChange(next)
    else if (onToggleFilter) onToggleFilter(next)
    else setUncontrolledFilterMode(next)
  }

  const setCloudTransparency = (next: RadarCloudTransparency) => {
    if (onCloudTransparencyChange) onCloudTransparencyChange(next)
    else setUncontrolledCloudTransparency(next)
  }

  const setCloudLighting = (next: RadarCloudLighting) => {
    if (onCloudLightingChange) onCloudLightingChange(next)
    else setUncontrolledCloudLighting(next)
  }

  const overlaySettings: RadarOverlaySettings = {
    renderMode: activeRenderMode,
    filterMode: activeFilterMode,
    cloudTransparency: activeCloudTransparency,
    cloudLighting: activeCloudLighting,
  }

  // Report only what changed, so hosts that persist each choice write nothing for the rest.
  const handleApplySettings = (next: RadarOverlaySettings) => {
    setIsSettingsOpen(false)
    if (next.renderMode !== activeRenderMode) setRenderMode(next.renderMode)
    if (next.filterMode !== activeFilterMode) setFilterMode(next.filterMode)
    if (next.cloudTransparency !== activeCloudTransparency) setCloudTransparency(next.cloudTransparency)
    if (next.cloudLighting !== activeCloudLighting) setCloudLighting(next.cloudLighting)
  }

  const handleManualRefresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    setRadarStatus('loading')
    setRetryKey(key => key + 1)
  }

  const activeWindSpeed = windSpeed ?? 0
  const activeWindDirection = windDir ?? 0
  const isRadarUnavailable = !radarSource || radarStatus === 'error'
  // The intensity legend explains the heatmap only.
  const isLegendShown = showLegend && !useClouds

  // The settings dialog sits outside the root, so its clicks never reach the map's pointer handlers.
  return (
    <>
    <div
      ref={rootRef}
      className={`family-radar relative overflow-hidden select-none bg-[#0c121e] ${interactive ? 'pointer-events-auto' : 'pointer-events-none'
        } ${className}`}
      style={{
        width: propMapWidth ? `${propMapWidth}px` : undefined,
        height: propMapHeight ? `${propMapHeight}px` : undefined,
        ...style,
      }}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerLeave={interactive ? handlePointerLeave : undefined}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onClick={interactive ? handleClick : undefined}
    >
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.15),transparent_70%)] pointer-events-none" />

      {/* Radar distance grid background & concentric range rings. The outer ring overhangs the
          card; clipping it here keeps the card itself from gaining a scroll range that
          scroll-into-view (e.g. focusing a control) would use to shift the whole radar. */}
      <div className="absolute inset-0 overflow-clip opacity-20 pointer-events-none">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="rounded-full border border-sky-500/15"
            style={{
              width: isCompact ? 330 : Math.min(resolvedWidth * 0.75, 480),
              height: isCompact ? 330 : Math.min(resolvedWidth * 0.75, 480),
            }}
          />
          <div
            className="absolute rounded-full border border-sky-500/20"
            style={{
              width: isCompact ? 220 : Math.min(resolvedWidth * 0.5, 320),
              height: isCompact ? 220 : Math.min(resolvedWidth * 0.5, 320),
            }}
          />
          <div
            className="absolute rounded-full border border-sky-500/25"
            style={{
              width: isCompact ? 110 : Math.min(resolvedWidth * 0.25, 160),
              height: isCompact ? 110 : Math.min(resolvedWidth * 0.25, 160),
            }}
          />
          {/* Crosshairs */}
          <div className="absolute w-full h-px bg-sky-500/15" />
          <div className="absolute h-full w-px bg-sky-500/15" />
          {/* Cardinal directions */}
          {showCardinalDirections && (
            <>
              <span className="absolute top-1.5 font-mono text-[9px] text-sky-400/50">N</span>
              <span className="absolute bottom-1.5 font-mono text-[9px] text-sky-400/50">S</span>
              <span className="absolute left-2 font-mono text-[9px] text-sky-400/50">W</span>
              <span className="absolute right-2 font-mono text-[9px] text-sky-400/50">E</span>
            </>
          )}
        </div>
      </div>

      {/* Basemap and camera: a key-free MapLibre map that owns zoom and pan gestures */}
      <div
        ref={mapContainerRef}
        data-testid="radar-map"
        className={`family-radar-map absolute inset-0 ${interactive ? '' : 'pointer-events-none'}`}
      />

      {/* Without WebGL: a fixed basemap at the home view */}
      {mapStatus === 'failed' && showBasemap && (
        <RadarBasemapCanvas
          latitude={latitude}
          longitude={longitude}
          deltaMeters={deltaMeters}
          isDark={isDark}
          mapStyle={currentMapStyle}
          opacity={0.85}
        />
      )}

      {/* Airplane Shadows (Under Clouds) */}
      {showAirplanes && (
        <AirplaneCanvas
          loop={loop}
          mode="shadows"
          planes={airplanes}
          isDark={isDark}
          className="absolute inset-0 z-0 opacity-70 mix-blend-multiply"
        />
      )}

      {/* Live Airplanes Layer (Low Altitude, Under Clouds) */}
      {showAirplanes && (
        <AirplaneCanvas
          loop={loop}
          mode="airplanes"
          planes={airplanes}
          isDark={isDark}
          windSpeedMs={activeWindSpeed}
          windDirectionDeg={activeWindDirection}
          renderMaxAltitude={3500} // Under clouds
          className="absolute inset-0 z-0 opacity-85"
        />
      )}

      {/* Radar Overlay: Procedural Realistic Clouds or Doppler Heatmap, anchored to the ground */}
      {radarSource && (
        <CloudRadarCanvas
          loop={loop}
          source={radarSource}
          filterMode={activeFilterMode}
          mode={useClouds ? 'clouds' : 'heatmap'}
          cloudOpacity={cloudTransparencyOpacity * cloudOpacity}
          isDark={isDark}
          latitude={latitude}
          longitude={longitude}
          windSpeedMs={activeWindSpeed}
          windDirectionDeg={activeWindDirection}
          echoMotion={nowcast?.motion}
          morphDurationMs={playbackTime || isPlaying ? playbackSpeed : 3500}
          isPlaying={isPlaying}
          playbackTime={playbackTime}
          playbackTimestamps={timeline.timestamps}
          forecast={timeline.forecast}
          liveRefreshMs={radarRefreshMs}
          retryKey={retryKey}
          onStatusChange={setRadarStatus}
          cloudLighting={activeCloudLighting}
          className={`absolute inset-0 w-full h-full ${useClouds ? '' : 'mix-blend-screen'}`}
        />
      )}
      {isRadarUnavailable && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center text-xs text-slate-400 pointer-events-none">
          <Radar size={20} className="text-slate-600 mb-1" />
          <p>Radar scan temporarily unavailable</p>
          {interactive && radarSource && (
            <Button size="sm" variant="overlay" tone="sky" onClick={handleManualRefresh} className="mt-1.5 pointer-events-auto">
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Lightning Strikes & Thunderstorm Canvas Layer */}
      {thunderstorm?.strikes && thunderstorm.strikes.length > 0 && (
        <LightningRadarCanvas
          loop={loop}
          strikes={thunderstorm.strikes}
          latitude={latitude}
          longitude={longitude}
          isDark={isDark}
          windSpeedMs={activeWindSpeed}
          windDirectionDeg={activeWindDirection}
          className="absolute inset-0 z-0"
        />
      )}

      {/* Aurora Borealis Curtain Layer: Luminous ionospheric drapery "closer to camera" than clouds */}
      {hasActiveAurora && (
        <AuroraRadarCanvas
          intensity={auroraKp ? Math.min(1.8, Math.max(0.7, auroraKp / 4.0)) : 1.0}
        />
      )}

      {/* Live Airplanes Layer (High Altitude, Over Clouds) */}
      {showAirplanes && (
        <AirplaneCanvas
          loop={loop}
          mode="airplanes"
          planes={airplanes}
          isDark={isDark}
          windSpeedMs={activeWindSpeed}
          windDirectionDeg={activeWindDirection}
          renderMinAltitude={3500} // Over clouds
          pointerRef={pointerRef}
          onHover={interactive ? handleAirplaneHover : undefined}
          className="absolute inset-0 z-0 opacity-85"
        />
      )}

      {/* Home Location Pulse Pin, pinned to the ground */}
      <div ref={pinRef} className="absolute left-0 top-0 w-0 h-0 pointer-events-none z-0" data-testid="radar-home-pin">
        <div className="relative -translate-x-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
          <span className="absolute w-4 h-4 rounded-full bg-cyan-400/40 animate-radar-ping" />
          <span className="relative w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
        </div>
      </div>

      {/* Top Header Bar */}
      <div
        className={`absolute top-0 inset-x-0 pl-3 pr-2.5 py-2 flex items-center justify-between gap-2 overflow-hidden z-10 pointer-events-none ${isDark ? 'bg-gradient-to-b from-black/85 via-black/40 to-transparent' : ''}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {/* The timeline, open whenever a past or forecast frame shows, labels that frame itself */}
          {hasActiveAurora && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-400/50 aurora-text-shimmer aurora-pill-glow shadow-xs shrink-0 select-none">
              <span>✨</span>
              <span>Aurora{auroraKp ? ` · Kp ${auroraKp.toFixed(1)}` : ''}</span>
            </span>
          )}
          {thunderstorm?.isActive && (
            <span
              title={thunderstorm.summary}
              className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/50 border border-amber-400/30 text-amber-300/90 backdrop-blur-md shadow-sm shrink-0 select-none"
            >
              <Zap size={10} className="fill-amber-400 text-amber-300 shrink-0" />
              <span>
                {thunderstorm.closestStrikeKm != null
                  ? `Storm · ${thunderstorm.closestStrikeKm} km ${thunderstorm.closestStrikeBearing ?? ''}`.trim()
                  : `Storm · ${thunderstorm.recentStrikeCount} strikes`}
              </span>
            </span>
          )}
          <RadarWindBadge
            speedMs={windSpeed ?? undefined}
            gustMs={windGust ?? undefined}
            directionDeg={windDir ?? undefined}
            compact={isCompact}
          />
          {/* Instant Rain / Dry Reading — paired with wind telemetry */}
          {rainRate != null && Number.isFinite(rainRate) && rainRate > 0 && (
            <span
              title={
                rainRate >= 0.01
                  ? `Radar rain rate: ${rainRate < 0.1 ? `${rainRate.toFixed(2)} mm/h` : `${rainRate.toFixed(1)} mm/h`}`
                  : 'Radar rain rate: 0.0 mm/h (Dry)'
              }
              className="font-mono text-[10px] text-cyan-300 font-semibold flex items-center gap-1.5 whitespace-nowrap bg-black/50 border border-white/10 px-2 py-0.5 rounded-full backdrop-blur-md shadow-sm select-none shrink-0"
            >
              <Droplet size={11} className="shrink-0 text-cyan-400 fill-cyan-400/40" />
              <span>
                {rainRate >= 0.01
                  ? `${rainRate < 0.1 ? rainRate.toFixed(2) : rainRate.toFixed(1)}`
                  : '0.0'}
              </span>
            </span>
          )}
        </div>

        {/* Map credits' "i" (opening leftwards over the badges), then the top-right slot in the corner */}
        <div className={`flex items-center gap-1.5 shrink-0 ${interactive ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div ref={attributionHostRef} className="family-radar-attribution" hidden={mapStatus === 'failed'} />
          {topRightSlot}
        </div>
      </div>

      {/* Bottom-Left: the map scale in the corner, then the heatmap legend. The scale keeps the same
          spot in both styles (Space swaps them), and its slot never narrows, so a zoom never moves the legend. */}
      {(isLegendShown || showScale) && (
        <div
          className={`absolute inset-x-0 px-3 py-2.5 flex items-center justify-start gap-3 pointer-events-none text-[10px] text-white/80 font-medium whitespace-nowrap z-10 ${timelineOpen ? 'bottom-16' : 'bottom-0'} ${isLegendShown && isDark && !timelineOpen ? 'bg-gradient-to-t from-black/90 via-black/40 to-transparent' : ''
            }`}
        >
          {/* Map scale: a round ground distance at the view center, sized each frame */}
          {showScale && (
            <div className="flex shrink-0 self-end" style={{ minWidth: SCALE_BAR_MAX_PX }}>
              <div className="family-radar-scale" data-testid="radar-scale" aria-hidden="true">
                <span ref={scaleLabelRef} className="family-radar-scale-label font-mono tabular-nums" />
                <div ref={scaleBarRef} className="family-radar-scale-bar" />
              </div>
            </div>
          )}

          {isLegendShown && <div
            className={`relative group/legend flex items-center gap-1.5 text-[9px] shrink-0 whitespace-nowrap ${interactive
              ? 'cursor-pointer pointer-events-auto'
              : 'pointer-events-none'
              } ${isDark
                ? ''
                : 'bg-black/50 border border-white/10 px-2 py-1 rounded-full backdrop-blur-md shadow-sm'
              }`}
          >
            <span className={isRainOnly ? 'text-sky-300' : 'text-slate-200'}>
              {isRainOnly ? 'Light' : 'Clouds'}
            </span>
            <div
              className={`h-2 rounded-full ${isRainOnly
                ? 'w-14 bg-[linear-gradient(to_right,#3b82f6,#34d399,#fbbf24,#f43f5e)]'
                : 'w-16 bg-[linear-gradient(to_right,#dbe7f7,#5eb4f6,#3f6fe0,#9b4fcf,#ec5a7a,#fbb944)]'
                }`}
            />
            <span className={`font-semibold ${isRainOnly ? 'text-rose-300' : 'text-orange-300'}`}>Downpour</span>

            {/* Hover Popover Explaining Intensity Scale (only for interactive displays) */}
            {interactive && (
              <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover/legend:flex flex-col gap-1 p-2 rounded-lg bg-slate-900/95 border border-slate-700/80 shadow-xl backdrop-blur-md text-[9px] text-slate-200 pointer-events-none z-50 w-44">
                <div className="font-semibold text-white border-b border-slate-700/60 pb-1 flex items-center justify-between">
                  <span>Radar Intensity</span>
                  <span className="text-[8px] font-mono text-slate-400">mm/h</span>
                </div>
                {LEGEND_ROWS[isRainOnly ? 'rain' : 'clouds'].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-[8px]">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${row.dot}`} />
                      <span className={row.text}>{row.label}</span>
                    </span>
                    <span className="font-mono text-slate-400">{row.range}</span>
                  </div>
                ))}
              </div>
            )}
          </div>}
        </div>
      )}

      {/* Bottom-Right: timeline and settings buttons on interactive maps */}
      {interactive && showControls && (showSettingsControl || canShowTimeline) && (
        <div
          className={`absolute right-2.5 z-10 flex items-center gap-1.5 transition-[bottom] duration-300 ${timelineOpen ? 'bottom-[4.5rem]' : 'bottom-2.5'} pointer-events-auto`}
        >
          {/* Timeline Toggle */}
          {canShowTimeline && !timelineOpen && (
            <Button
              size="sm"
              variant="overlay"
              tone="primary"
              onClick={(e) => { e.stopPropagation(); setTimelineRequested(true) }}
              title={forecastMinutes > 0 ? 'Timeline: today’s radar and the forecast' : 'Timeline: today’s radar'}
              icon={<History />}
            >
              Timeline
            </Button>
          )}

          {/* Map settings: renderer, cloud filter, transparency, and lighting in one dialog */}
          {showSettingsControl && (
            <Button
              size="sm"
              variant="overlay"
              tone="neutral"
              onClick={(e) => { e.stopPropagation(); openSettings() }}
              title={onOpenSettings ? 'Settings' : 'Map settings: style, clouds, transparency, and lighting'}
              aria-haspopup="dialog"
              icon={<SettingsIcon className="text-sky-300" />}
              hideLabel
            >
              Settings
            </Button>
          )}
        </div>
      )}

      {/* Timeline over the bottom of the map */}
      {timelineOpen && (
        <div className="absolute bottom-2 left-2 right-2 z-20 pointer-events-auto" data-testid="radar-timeline">
          <RadarPlaybackToolbar
            timestamps={timeline.timestamps}
            nowIndex={timeline.nowIndex}
            playbackTime={playbackTime}
            onTimeSelect={setPlaybackTime}
            isPlaying={isPlaying}
            onPlayingChange={setIsPlaying}
            playbackSpeed={playbackSpeed}
            onSpeedChange={setPlaybackSpeed}
            onClose={closeTimeline}
            isDark={isDark}
            forecastStatus={forecastStatus}
            forecastCaption={forecastCaption}
          />
        </div>
      )}
    </div>
    {isSettingsOpen && showSettingsControl && (
      <RadarSettingsDialog
        isDark={isDark}
        settings={overlaySettings}
        showRenderMode={showRenderModeToggle}
        showFilter={showFilterControl}
        showCloudTransparency={showCloudTransparencyControl}
        showCloudLighting={showCloudLightingControl}
        onApply={handleApplySettings}
        onClose={() => setIsSettingsOpen(false)}
      />
    )}
    </>
  )
}
