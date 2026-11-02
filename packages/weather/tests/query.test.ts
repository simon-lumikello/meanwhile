import { afterEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import {
  auroraForecastQueryKey,
  locationSearchQueryKey,
  locationSearchQueryOptions,
  weatherForecastQueryKey,
  weatherForecastQueryOptions,
} from '../src/query'
import type { WeatherProvider } from '../src/providerTypes'

const clients: QueryClient[] = []

function createClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return client
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
})

function provider(id = 'open-meteo'): WeatherProvider {
  return {
    id,
    name: id,
    description: id,
    defaultConfig: {},
    fetchForecast: async () => [],
  }
}

const config = { place: 'Helsinki', latitude: 60.1695, longitude: 24.9354 }
const date = new Date('2026-09-21T12:00:00+03:00')

describe('weather query contracts', () => {
  it('shares one mounted provider request for identical source, location, date, and mapping inputs', async () => {
    const client = createClient()
    let requests = 0
    const options = weatherForecastQueryOptions({
      provider: provider(),
      config,
      date,
      fetchForecast: async () => {
        requests += 1
        return []
      },
    })
    const first = new QueryObserver(client, options)
    const second = new QueryObserver(client, options)
    const unsubscribeFirst = first.subscribe(() => undefined)
    const unsubscribeSecond = second.subscribe(() => undefined)

    await Promise.all([first.refetch(), second.refetch()])

    expect(requests).toBe(1)
    unsubscribeFirst()
    unsubscribeSecond()
  })

  it('partitions source, coordinates, date, and consumer mapping inputs', () => {
    const base = { provider: provider(), config, date }
    expect(weatherForecastQueryKey(base)).not.toEqual(weatherForecastQueryKey({ ...base, provider: provider('fmi') }))
    expect(weatherForecastQueryKey(base)).not.toEqual(weatherForecastQueryKey({ ...base, config: { ...config, latitude: 61 } }))
    expect(weatherForecastQueryKey(base)).not.toEqual(weatherForecastQueryKey({ ...base, date: new Date('2026-09-22T12:00:00+03:00') }))
    expect(weatherForecastQueryKey(base)).not.toEqual(weatherForecastQueryKey({ ...base, mappingKey: 'dashboard-fmi-radar-v1' }))
    expect(auroraForecastQueryKey()).not.toEqual(auroraForecastQueryKey('fixture-source'))
  })

  it('cancels the old location request before mounting a replacement location', async () => {
    const client = createClient()
    let aborted = false
    const oldOptions = weatherForecastQueryOptions({
      provider: provider(),
      config,
      date,
      fetchForecast: ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true
          reject(signal.reason)
        })
      }),
    })
    const observer = new QueryObserver(client, oldOptions)
    const unsubscribe = observer.subscribe(() => undefined)
    const pending = observer.refetch()

    await client.cancelQueries({ queryKey: oldOptions.queryKey })
    await pending
    expect(aborted).toBe(true)

    const newOptions = weatherForecastQueryOptions({
      provider: provider(),
      config: { ...config, latitude: 61.1 },
      date,
      fetchForecast: async () => [],
    })
    observer.setOptions(newOptions)
    await expect(observer.refetch()).resolves.toMatchObject({ isSuccess: true })
    unsubscribe()
  })

  it('retains stale data when a background refetch errors', async () => {
    const client = createClient()
    const options = weatherForecastQueryOptions({
      provider: provider(),
      config,
      date,
      fetchForecast: async () => {
        throw new Error('offline')
      },
    })
    const stalePoint = { time: '2026-09-21T10:00:00+03:00', temperature: 12, precipitationMm: 0, symbol: 'clear-day' as const }
    client.setQueryData(options.queryKey, [stalePoint])
    const observer = new QueryObserver(client, options)
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()

    expect(observer.getCurrentResult().isError).toBe(true)
    expect(observer.getCurrentResult().data).toEqual([stalePoint])
    unsubscribe()
  })

  it('uses a new local-date cache entry at midnight rollover', () => {
    const today = weatherForecastQueryKey({ provider: provider(), config, date: new Date(2026, 8, 21, 23, 59) })
    const tomorrow = weatherForecastQueryKey({ provider: provider(), config, date: new Date(2026, 8, 22, 0, 1) })
    expect(today).not.toEqual(tomorrow)
  })
})

describe('location search query', () => {
  it('keys by provider and normalised text, and waits for two characters', async () => {
    expect(locationSearchQueryKey({ query: ' Tampere ', providerId: 'fmi' })).toEqual(['weather', 'location-search', 'fmi', 'tampere'])
    expect(locationSearchQueryKey({ query: 'Tampere', providerId: 'fmi' })).not.toEqual(locationSearchQueryKey({ query: 'Tampere', providerId: 'open-meteo' }))
    expect(locationSearchQueryOptions({ query: 'T' }).enabled).toBe(false)

    const requested: string[] = []
    const transport = (async (url: string | URL | Request) => {
      requested.push(String(url))
      return new Response(JSON.stringify({ results: [{ name: 'Tampere', country: 'Finland', admin1: 'Pirkanmaa', latitude: 61.5, longitude: 23.76 }] }))
    }) as typeof fetch
    const results = await createClient().fetchQuery(locationSearchQueryOptions({ query: 'Tampere', providerId: 'fmi', transport }))
    expect(results).toEqual([{ name: 'Tampere', country: 'Finland', admin1: 'Pirkanmaa', latitude: 61.5, longitude: 23.76 }])
    expect(requested[0]).toContain('countryCode=FI')
  })
})
