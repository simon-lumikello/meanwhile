import type { SwimlaneConfig } from './swimlane'
import type {
  RadarCloudLighting,
  RadarCloudTransparency,
  RadarFilterMode,
  RadarRenderMode,
  RadarWidgetSize,
  RadarZoomLevel,
} from '@simon-lumikello/meanwhile-radar/core'

export type TimelineOrientation = 'horizontal' | 'vertical'
export type GridLineIntensity = 'subtle' | 'medium' | 'vivid'
export type ThemeMode = 'system' | 'dark' | 'light'

/** The live weather map (FMI radar), shown on the timeline and the ambient screen. */
export interface WeatherMapConfig {
  showOnTimeline: boolean
  showOnAmbient: boolean
  size: RadarWidgetSize
  showAirplanes: boolean
  // Chosen with the map's own controls and remembered here; not shown in settings.
  zoom: RadarZoomLevel
  filterMode: RadarFilterMode
  renderMode: RadarRenderMode
  cloudTransparency: RadarCloudTransparency
  cloudLighting: RadarCloudLighting
}

export interface DashboardConfig {
  theme?: ThemeMode
  orientation: TimelineOrientation
  mutePastEvents: boolean
  clock24h: boolean
  idleResetMinutes: number
  kioskMode?: boolean
  zebraStriping: boolean
  gridLineIntensity: GridLineIntensity
  nightMode: {
    enabled: boolean
    startHour: number // e.g. 23
    endHour: number   // e.g. 6
    dimAfterLastEvent?: boolean
    dimAfterLastEventGraceSeconds?: number
    dimAfterLastEventGraceMinutes?: number
    backgroundDim?: number // 40-95%, default 80
    cardDim?: number       // 20-100%, default 70
    auroraAlerts?: boolean // Show glowing Northern Lights indicator when active
    showWeekAhead?: boolean // Add the five days after tomorrow as compact cards, default off
  }
  weatherMap: WeatherMapConfig
  swimlanes: SwimlaneConfig[]
  /** Set to true once the user has dismissed the first-launch welcome dialog */
  welcomeSeen?: boolean
}
