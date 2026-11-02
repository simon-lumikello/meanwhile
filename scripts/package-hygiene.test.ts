import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Package architecture rules for every library.
const ROOT_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages')
const read = (relative: string) => fs.readFileSync(path.join(PACKAGES_DIR, relative), 'utf8')
const manifest = (name: string) => JSON.parse(read(`${name}/package.json`))
const packageNames = () => fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(PACKAGES_DIR, entry.name, 'package.json')))
  .map(entry => entry.name)

describe('Library architecture & dependency hygiene', () => {
  it('keeps weather independent from radar transport and forecast mutation', () => {
    const weatherPackage = manifest('weather')
    const fmiProvider = read('weather/src/fmiProvider.ts')

    expect(weatherPackage.dependencies?.['@simon-lumikello/meanwhile-radar']).toBeUndefined()
    expect(weatherPackage.dependencies?.['@simon-lumikello/meanwhile-settings']).toBeUndefined()
    expect(fmiProvider).not.toContain('@simon-lumikello/meanwhile-radar')
    expect(fmiProvider).not.toContain('fetchRadarRainRate')
    expect(fmiProvider).not.toContain('blendRadarIntoTimeline')
  })

  it('defines explicit weather entrypoints and keeps core free of browser and transport concerns', () => {
    const weatherPackage = manifest('weather')
    const coreSource = ['core.ts', 'weather.ts', 'weatherForecast.ts', 'solar.ts', 'daylight.ts', 'aurora.ts', 'auroraEvaluation.ts']
      .map(file => read(`weather/src/${file}`)).join('\n')

    expect(weatherPackage.exports['.']).toBe('./src/index.ts')
    expect(weatherPackage.exports['./core']).toBe('./src/core.ts')
    expect(weatherPackage.exports['./providers']).toBe('./src/providers.ts')
    expect(weatherPackage.exports['./query']).toBe('./src/query.ts')
    expect(weatherPackage.exports['./react']).toBe('./src/react.ts')
    expect(weatherPackage.exports['./style.css']).toBe('./src/weather.css')
    expect(read('weather/src/providers.ts')).toContain("from './noaaProvider'")
    expect(coreSource).not.toMatch(/from ['"](?:react|lucide-react|@tanstack\/react-query)['"]|\bfetch\(|\bnavigator\b|\blocalStorage\b|@weather\//)
  })

  it('keeps radar solar and celestial consumers on the weather core entrypoint', () => {
    const radarSources = ['radar/src/CloudRadarCanvas.tsx', 'radar/src/LightningRadarCanvas.tsx', 'radar/src/core.ts'].map(read).join('\n')

    expect(radarSources).toContain('@simon-lumikello/meanwhile-weather/core')
    expect(radarSources).not.toMatch(/from ['"]@simon-lumikello\/meanwhile-weather['"]/)
  })

  it('keeps application concerns (settings, timeline, Lane layout) out of the libraries', () => {
    expect(fs.existsSync(path.join(PACKAGES_DIR, 'settings'))).toBe(false)
    expect(fs.existsSync(path.join(PACKAGES_DIR, 'timeline'))).toBe(false)
    expect(read('weather/src/index.ts')).not.toContain('WeatherSwimlane')

    const weatherDomainModel = read('weather/src/weather.ts')
    expect(weatherDomainModel).not.toContain('DOMRect')
    expect(weatherDomainModel).not.toContain('SwimlaneColorScheme')
    expect(weatherDomainModel).not.toContain('HoveredWeatherInfo')
  })

  it('keeps radar-owned options and telemetry independent from application settings', () => {
    const radarPackage = manifest('radar')
    const radarTypes = read('radar/src/types.ts')
    const radarCore = read('radar/src/core.ts')

    expect(radarPackage.dependencies?.['@simon-lumikello/meanwhile-settings']).toBeUndefined()
    expect(radarPackage.devDependencies?.['@simon-lumikello/meanwhile-settings']).toBeUndefined()
    expect(radarTypes).not.toContain('@simon-lumikello/meanwhile-settings')
    expect(radarCore).not.toContain('@simon-lumikello/meanwhile-settings')
    expect(radarTypes).toContain('export type RadarZoomLevel')
    expect(radarTypes).toContain('export interface RainProximityAlert')
  })

  it('keeps ambient presentation on explicit source entry points and free of application lifecycle', () => {
    const ambientPackage = manifest('ambient')

    expect(ambientPackage.exports['./core']).toBe('./src/core.ts')
    expect(ambientPackage.exports['./react']).toBe('./src/react.ts')
    expect(ambientPackage.exports['./style.css']).toBe('./src/ambient.css')
    expect(read('ambient/src/AmbientView.tsx')).not.toMatch(/addEventListener|setTimeout|localStorage|@simon-lumikello\/meanwhile-radar/)
  })

  it('forbids React and React Query in package dependencies (singleton rule)', () => {
    // Singleton context libraries must be peers: a bundled duplicate instance causes
    // "No QueryClient set, use QueryClientProvider to set one" in consumers.
    const forbidden = ['react', 'react-dom', '@tanstack/react-query', '@tanstack/query-core']
    const names = packageNames()
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const dependencies = manifest(name).dependencies ?? {}
      for (const dependency of forbidden) expect(dependencies[dependency]).toBeUndefined()
    }
  })

  it('declares React Query as a peer with a matching major version', () => {
    for (const name of packageNames()) {
      const { peerDependencies = {}, devDependencies = {} } = manifest(name)
      if (peerDependencies['@tanstack/react-query']) expect(peerDependencies['@tanstack/react-query']).toMatch(/\^?5\./)
      if (devDependencies['@tanstack/react-query']) expect(devDependencies['@tanstack/react-query']).toMatch(/\^?5\./)
    }
  })
})
