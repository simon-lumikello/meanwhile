import { afterEach, describe, expect, it, setSystemTime } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AuroraKpPoint, HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import { getWeatherProvider } from '@simon-lumikello/meanwhile-weather/providers'
import { auroraForecastQueryKey, weatherForecastQueryKey } from '@simon-lumikello/meanwhile-weather/query'
import App from '../src/App'
import { DEFAULT_AMBIENT_CONFIG } from '../src/storage'

afterEach(() => setSystemTime())

function renderClock(symbol: HourlyWeatherPoint['symbol'] | undefined, kp = 6, time = '2026-09-09T20:00:00Z', tomorrowSymbol: HourlyWeatherPoint['symbol'] = 'cloudy') {
  const now = new Date(time)
  setSystemTime(now)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const provider = getWeatherProvider('fmi')
  const { latitude, longitude, location } = DEFAULT_AMBIENT_CONFIG
  const config = { ...provider.defaultConfig, latitude, longitude, place: location }
  const weather: HourlyWeatherPoint[] = symbol ? [{ time, temperature: 10, precipitationMm: 0, symbol }] : []
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const tomorrowTime = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const tomorrowWeather: HourlyWeatherPoint[] = [{ time: tomorrowTime, temperature: 10, precipitationMm: 0, symbol: tomorrowSymbol }]
  const points: AuroraKpPoint[] = [time, tomorrowTime].map(time => ({ time, kp, observed: 'predicted', noaaScale: null }))
  client.setQueryData(weatherForecastQueryKey({ provider, date: now, config }), weather)
  client.setQueryData(weatherForecastQueryKey({ provider, date: tomorrow, config }), tomorrowWeather)
  client.setQueryData(auroraForecastQueryKey(), points)
  try {
    return renderToStaticMarkup(<QueryClientProvider client={client}><App /></QueryClientProvider>)
  } finally {
    client.clear()
  }
}

describe('Weather Clock aurora wiring', () => {
  it('shows the current aurora forecast card even when the optional radar is disabled', () => {
    const html = renderClock('clear-night')
    expect(html).toContain('Aurora Visible Now · Kp 6.0')
    expect(html).toContain('aurora-card-border')
  })

  it('shows tomorrow evening aurora independently of current cloud cover', () => {
    const html = renderClock('cloudy', 6, '2026-09-09T20:00:00Z', 'clear-night')
    expect(html).not.toContain('Aurora Visible Now')
    expect(html).toContain('Aurora · Kp 6.0')
  })

  it('suppresses the indication without favorable weather, sufficient Kp, or darkness', () => {
    expect(renderClock('cloudy')).not.toContain('Aurora Visible Now')
    expect(renderClock(undefined)).not.toContain('Aurora Visible Now')
    expect(renderClock('clear-night', 2)).not.toContain('Aurora Visible Now')
    expect(renderClock('clear-day', 6, '2026-09-09T12:00:00Z')).not.toContain('Aurora Visible Now')
  })
})
