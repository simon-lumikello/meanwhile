export type WeatherSymbol =
  | 'clear-day'
  | 'clear-night'
  | 'partly-cloudy-day'
  | 'partly-cloudy-night'
  | 'cloudy'
  | 'fog'
  | 'rain-light'
  | 'rain-moderate'
  | 'rain-heavy'
  | 'sleet'
  | 'snow-light'
  | 'snow-heavy'
  | 'thunder'

export interface HourlyWeatherPoint {
  time: string // ISO 8601 string
  temperature: number // °C
  symbol: WeatherSymbol
  precipitationMm: number // mm
  precipitationProbability?: number // 0-100%
  windSpeedMs?: number // m/s
  windGustMs?: number // m/s
  windDirectionDeg?: number // meteorological wind direction in degrees (0-360, from where wind blows)
  isStormWarning?: boolean // true if gusts or speed >= 14 m/s
  description?: string
  isDay?: boolean // true if daytime (between sunrise and sunset), false if night
  sunrise?: string // ISO 8601 string of sunrise for this day
  sunset?: string // ISO 8601 string of sunset for this day
}

export interface WindData {
  speedMs: number
  gustMs?: number
  directionDeg?: number
  isStormWarning?: boolean
}
