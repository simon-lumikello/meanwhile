import React from 'react'
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudLightning,
  CloudSnow,
} from 'lucide-react'
import type { WeatherSymbol } from './weather'

function iconClass(tone: 'sun' | 'moon' | 'cloud' | 'rain-light' | 'rain' | 'thunder' | 'snow') {
  return `weather-icon weather-icon--${tone}`
}

export function renderWeatherIcon(symbol: WeatherSymbol, size = 18): React.ReactElement {
  switch (symbol) {
    case 'clear-day':
      return <Sun size={size} className={iconClass('sun')} />
    case 'clear-night':
      return <Moon size={size} className={iconClass('moon')} />
    case 'partly-cloudy-day':
      return <CloudSun size={size} className={iconClass('sun')} />
    case 'partly-cloudy-night':
      return <CloudMoon size={size} className={iconClass('moon')} />
    case 'cloudy':
      return <Cloud size={size} className={iconClass('cloud')} />
    case 'fog':
      return <CloudFog size={size} className={iconClass('cloud')} />
    case 'rain-light':
      return <CloudDrizzle size={size} className={iconClass('rain-light')} />
    case 'rain-moderate':
    case 'rain-heavy':
      return <CloudRain size={size} className={iconClass('rain')} />
    case 'thunder':
      return <CloudLightning size={size} className={iconClass('thunder')} />
    case 'snow-light':
    case 'snow-heavy':
    case 'sleet':
      return <CloudSnow size={size} className={iconClass('snow')} />
    default:
      return <Sun size={size} className={iconClass('sun')} />
  }
}
