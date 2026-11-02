// The declaration of the virtual worker module must reach every app's type check, not only this
// package's; an ambient .d.ts cannot be imported, so it is referenced.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./styles.d.ts" />
// Loaded on demand by RadarViewport so the map engine never weighs on a host's first paint.
import { AttributionControl, Map as MapLibreMap, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
// Bundled into this chunk by the host's build through the maplibreWorkerSource plugin (see vite.ts).
import maplibreWorkerSource from 'virtual:maplibre-worker-source'
import { deltaMetersToMapZoom, mapZoomToMetersPerPixel, type RadarCamera } from './camera'
import { latLonToWebMercator } from './mercator'
import type { RadarMapStyle } from './types'

const ESRI_ATTRIBUTION = 'Basemap © Esri'
const OSM_ATTRIBUTION = '© OpenStreetMap contributors'
const DARK_CANVAS_LAYERS = ['dark-canvas-base', 'dark-canvas-labels'] as const
const OSM_LAYERS = ['osm'] as const

const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-dark-base': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 16,
      attribution: ESRI_ATTRIBUTION,
    },
    'esri-dark-labels': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 16,
    },
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [
    { id: 'dark-canvas-base', type: 'raster', source: 'esri-dark-base', layout: { visibility: 'none' } },
    { id: 'dark-canvas-labels', type: 'raster', source: 'esri-dark-labels', layout: { visibility: 'none' } },
    { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } },
  ],
}

export interface RadarMapView {
  latitude: number
  longitude: number
  deltaMeters: number
}

export interface CreateRadarMapOptions {
  container: HTMLElement
  view: RadarMapView
  interactive: boolean
  /** Extra attribution for the radar data itself. */
  attribution?: string
  /** Where the credits' "i" goes, such as the viewport's header; the map's top-right corner without it. */
  attributionContainer?: HTMLElement
}

export interface RadarMapHandle {
  map: MapLibreMap
  readCamera(): RadarCamera
  setBasemap(style: RadarMapStyle, visible: boolean): void
  jumpTo(view: RadarMapView): void
  easeTo(view: RadarMapView, durationMs?: number): void
  destroy(): void
}

let workerUrl: string | null = null
/** Widest view, as a vertical half-extent in EPSG:3857 meters: about all of Finland. */
const MAX_DELTA_METERS = 800000
/** Closest web map zoom level: street scale, far finer than the radar's 1 km cells. */
const MAX_ZOOM = 15
const minZoomFor = (height: number) => Math.min(MAX_ZOOM - 1, deltaMetersToMapZoom(MAX_DELTA_METERS, height))

function cameraOptions(view: RadarMapView, height: number) {
  return { center: [view.longitude, view.latitude] as [number, number], zoom: deltaMetersToMapZoom(view.deltaMeters, height) }
}

export function createRadarMap({ container, view, interactive, attribution, attributionContainer }: CreateRadarMapOptions): RadarMapHandle {
  if (!workerUrl) {
    // A same-origin blob URL, so MapLibre starts the module worker directly.
    workerUrl = URL.createObjectURL(new Blob([maplibreWorkerSource], { type: 'text/javascript' }))
    setWorkerUrl(workerUrl)
  }
  const map = new MapLibreMap({
    container,
    style: BASEMAP_STYLE,
    ...cameraOptions(view, container.clientHeight),
    interactive,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    rollEnabled: false,
    maxPitch: 0,
    renderWorldCopies: false,
    minZoom: minZoomFor(container.clientHeight),
    maxZoom: MAX_ZOOM,
    // A top-down radar has no symbols; this only shortens raster fade-in.
    fadeDuration: 150,
    refreshExpiredTiles: false,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    canvasContextAttributes: { antialias: false },
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  const attributionControl = new AttributionControl({ compact: true, customAttribution: attribution })
  // Mounted by hand in a host's element, so it can sit in a layout of the host's own controls.
  const credits = attributionContainer ? attributionControl.onAdd(map) : null
  if (credits && attributionContainer) attributionContainer.appendChild(credits)
  else map.addControl(attributionControl, 'top-right')
  // MapLibre opens the credits until the first drag, which never comes on a display-only
  // card; open they would cover the header badges. Start behind the "i", one tap from the credits.
  const creditsDetails = credits ?? container.querySelector('.maplibregl-ctrl-attrib')
  creditsDetails?.classList.remove('maplibregl-compact-show')
  creditsDetails?.removeAttribute('open')
  // Zoom limits are absolute, so the widest view follows the viewport height.
  map.on('resize', () => map.setMinZoom(minZoomFor(container.clientHeight)))

  const readCamera = (): RadarCamera => {
    const center = map.getCenter()
    const { x, y } = latLonToWebMercator(center.lat, center.lng)
    return {
      centerX: x,
      centerY: y,
      metersPerPixel: mapZoomToMetersPerPixel(map.getZoom()),
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
    }
  }

  let basemap: { style: RadarMapStyle; visible: boolean } | null = null
  const applyBasemap = () => {
    if (!basemap || !map.isStyleLoaded()) return
    const visibleLayers: readonly string[] = !basemap.visible ? [] : basemap.style === 'dark-canvas' ? DARK_CANVAS_LAYERS : OSM_LAYERS
    for (const id of [...DARK_CANVAS_LAYERS, ...OSM_LAYERS]) map.setLayoutProperty(id, 'visibility', visibleLayers.includes(id) ? 'visible' : 'none')
  }
  map.on('load', applyBasemap)

  return {
    map,
    readCamera,
    setBasemap(style, visible) {
      basemap = { style, visible }
      applyBasemap()
    },
    jumpTo(next) {
      map.jumpTo(cameraOptions(next, container.clientHeight))
    },
    easeTo(next, durationMs = 700) {
      map.easeTo({ ...cameraOptions(next, container.clientHeight), duration: durationMs, essential: false })
    },
    destroy() {
      if (credits) attributionControl.onRemove()
      map.remove()
    },
  }
}
