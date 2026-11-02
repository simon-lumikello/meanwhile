import { afterEach, describe, expect, it, setSystemTime } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AuroraKpPoint, HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import { getWeatherProvider } from '@simon-lumikello/meanwhile-weather/providers'
import { auroraForecastQueryKey, weatherForecastQueryKey } from '@simon-lumikello/meanwhile-weather/query'
import App from '../src/App'
import { DEFAULT_RADAR_CONFIG } from '../src/storage'

afterEach(() => setSystemTime())

function renderMap(symbol: HourlyWeatherPoint['symbol'] | undefined, kp = 6, time = '2026-09-09T20:00:00Z') {
  const now = new Date(time)
  setSystemTime(now)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const provider = getWeatherProvider('open-meteo')
  const { latitude, longitude, location } = DEFAULT_RADAR_CONFIG
  const config = { ...provider.defaultConfig, latitude, longitude, place: location }
  const weather: HourlyWeatherPoint[] = symbol ? [{ time, temperature: 10, precipitationMm: 0, symbol }] : []
  const points: AuroraKpPoint[] = [{ time, kp, observed: 'predicted', noaaScale: null }]
  client.setQueryData(weatherForecastQueryKey({ provider, date: now, config }), weather)
  client.setQueryData(auroraForecastQueryKey(), points)
  try {
    return renderToStaticMarkup(<QueryClientProvider client={client}><App /></QueryClientProvider>)
  } finally {
    client.clear()
  }
}

describe('Weather Map aurora wiring', () => {
  it('shows the shared radar aurora badge and overlay for clear nights with elevated Kp', () => {
    const html = renderMap('clear-night')
    expect(html).toContain('Aurora · Kp 6.0')
    expect(html).toContain('<canvas')
    expect(html).toContain('aurora-pill-glow')
  })

  it('suppresses the indication without favorable weather, sufficient Kp, or darkness', () => {
    expect(renderMap('cloudy')).not.toContain('Aurora · Kp')
    expect(renderMap(undefined)).not.toContain('Aurora · Kp')
    expect(renderMap('clear-night', 2)).not.toContain('Aurora · Kp')
    expect(renderMap('clear-day', 6, '2026-09-09T12:00:00Z')).not.toContain('Aurora · Kp')
  })
})
