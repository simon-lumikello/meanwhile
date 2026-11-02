export type SwimlaneType = 'google-calendar' | 'weather' | 'custom-api'

export interface SwimlaneColorScheme {
  primary: string    // Accent color (e.g. "#38bdf8", "#a855f7", "#34d399")
  secondary: string  // Subtle fill background (e.g. "rgba(56, 189, 248, 0.16)")
  accent: string     // Glow / border highlight
  text: string       // High contrast text
}

export interface SwimlaneConfig {
  id: string
  title: string
  enabled: boolean
  colorScheme: SwimlaneColorScheme
  icon: string // Lucide icon name (e.g. 'User', 'Heart', 'Briefcase', 'GraduationCap', 'CloudSun', 'Activity')
  type: SwimlaneType
  source: {
    endpoint: string // Calendar iCal URL or API param
    calendarSource?: 'url' | 'file' // Older configurations default to URL feeds.
    localCalendarFile?: { name: string; content: string }
    refreshIntervalMinutes?: number
    weatherProviderId?: string // 'fmi' | 'open-meteo'
    weatherLocation?: string   // 'Helsinki', etc.
    weatherLatitude?: number   // resolved lat from geocoding
    weatherLongitude?: number  // resolved lon from geocoding
    weatherLocationMode?: 'manual' | 'auto' // 'manual' (hand-picked) or 'auto' (automatically detected)
    manualLocation?: {
      name: string
      latitude: number
      longitude: number
    }
    autoLocation?: {
      name: string
      latitude: number
      longitude: number
      method?: 'gps' | 'ip'
    }
    showRainAlerts?: boolean   // Show proximity rain/snow approaching alert (default: true)
  }
}
export type WeatherLocationMode = 'manual' | 'auto'
