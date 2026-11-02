import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useThunderstormQuery, useAircraftQuery } from '@simon-lumikello/meanwhile-radar/query'

const ROOT_DIR = path.resolve(__dirname, '../../..')
const DASHBOARD_SETTINGS_PATH = path.resolve(ROOT_DIR, 'apps/dashboard/src/features/settings')
const DASHBOARD_TIMELINE_PATH = path.resolve(ROOT_DIR, 'apps/dashboard/src/features/timeline')
const VITE_CONFIG_PATH = path.resolve(ROOT_DIR, 'apps/dashboard/vite.config.ts')
const DOCKERFILE_PATH = path.resolve(ROOT_DIR, 'Dockerfile')
const BUN_LOCK_PATH = path.resolve(ROOT_DIR, 'bun.lock')
const VERCEL_JSON_PATH = path.resolve(ROOT_DIR, 'apps/dashboard/vercel.json')

describe('Dashboard Architecture & Dependency Hygiene', () => {
  it('keeps dashboard settings, timeline composition, and icon presentation app-local', () => {
    expect(fs.existsSync(DASHBOARD_SETTINGS_PATH)).toBe(true)
    expect(fs.existsSync(DASHBOARD_TIMELINE_PATH)).toBe(true)
    expect(fs.existsSync(path.resolve(ROOT_DIR, 'apps/dashboard/src/components/common/IconRenderer.tsx'))).toBe(true)
  })

  it('ensures vite.config.ts configures resolve.dedupe for react, react-dom, and @tanstack/react-query', () => {
    expect(fs.existsSync(VITE_CONFIG_PATH)).toBe(true)
    const viteConfigContent = fs.readFileSync(VITE_CONFIG_PATH, 'utf8')

    expect(viteConfigContent).toContain('dedupe')
    expect(viteConfigContent).toContain("'react'")
    expect(viteConfigContent).toContain("'react-dom'")
    expect(viteConfigContent).toContain("'@tanstack/react-query'")
  })

  it('resolves weather through its workspace package exports rather than a Vite or tsconfig source alias', () => {
    const viteConfigContent = fs.readFileSync(VITE_CONFIG_PATH, 'utf8')
    const dashboardTsconfig = fs.readFileSync(path.join(ROOT_DIR, 'apps/dashboard/tsconfig.app.json'), 'utf8')

    expect(viteConfigContent).not.toContain("'@simon-lumikello/meanwhile-weather")
    expect(dashboardTsconfig).not.toContain('packages/weather/src')
    expect(dashboardTsconfig).not.toContain('packages/*/src')
  })

  it('keeps ambient presentation on its workspace package exports and dashboard wake policy app-local', () => {
    const viteConfigContent = fs.readFileSync(VITE_CONFIG_PATH, 'utf8')
    const dashboardTsconfig = fs.readFileSync(path.join(ROOT_DIR, 'apps/dashboard/tsconfig.app.json'), 'utf8')
    const dashboardPolicy = fs.readFileSync(path.join(ROOT_DIR, 'apps/dashboard/src/components/ambient/ambientPolicy.ts'), 'utf8')

    expect(viteConfigContent).not.toContain('@simon-lumikello/meanwhile-ambient')
    expect(dashboardTsconfig).not.toContain('packages/ambient/src')
    expect(dashboardPolicy).toContain('shouldListenForDashboardWake')
  })

  it('ensures bun.lock contains no duplicate nested @tanstack/react-query installs', () => {
    expect(fs.existsSync(BUN_LOCK_PATH)).toBe(true)
    const lockContent = fs.readFileSync(BUN_LOCK_PATH, 'utf8')

    // Matches any workspace-nested package pattern like "@simon-lumikello/meanwhile-radar/@tanstack/react-query"
    const nestedReactQueryMatches = Array.from(
      lockContent.matchAll(/"@simon-lumikello\/[^"]+\/@tanstack\/react-query"/g)
    ).map((m) => m[0])

    expect(nestedReactQueryMatches).toEqual([])

    // Also verify no workspace-nested React or ReactDOM installs exist
    const nestedReactMatches = Array.from(
      lockContent.matchAll(/"@simon-lumikello\/[^"]+\/(?:react|react-dom)"/g)
    ).map((m) => m[0])

    expect(nestedReactMatches).toEqual([])
  })

  it('ensures the Docker build copies every workspace manifest before its cached install and needs no token', () => {
    expect(fs.existsSync(DOCKERFILE_PATH)).toBe(true)
    const dockerfileContent = fs.readFileSync(DOCKERFILE_PATH, 'utf8')

    const installIndex = dockerfileContent.indexOf('bun install --frozen-lockfile')
    expect(installIndex).toBeGreaterThan(0)
    const beforeInstall = dockerfileContent.slice(0, installIndex)

    // A frozen install fails unless every workspace the lockfile lists has its manifest in place.
    const workspaces = ['apps', 'packages'].flatMap(parent => fs.readdirSync(path.join(ROOT_DIR, parent), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && fs.existsSync(path.join(ROOT_DIR, parent, entry.name, 'package.json')))
      .map(entry => `${parent}/${entry.name}/package.json`))
    expect(workspaces).toContain('apps/dashboard/package.json')
    for (const manifest of workspaces) expect(beforeInstall).toContain(manifest)
    // The libraries are workspace source, so the build needs no secrets.
    expect(dockerfileContent).not.toContain('--mount=type=secret')
  })

  it('ensures production bundle assets do not duplicate @tanstack/react-query', () => {
    const distAssetsDir = path.resolve(ROOT_DIR, 'apps/dashboard/dist/assets')
    if (!fs.existsSync(distAssetsDir)) return

    const jsFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'))
    let totalQueryClientErrorCount = 0

    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf8')
      const matches = content.match(/No QueryClient set, use QueryClientProvider to set one/g)
      if (matches) {
        totalQueryClientErrorCount += matches.length
      }
    }

    // In a properly deduplicated bundle, the hook error string should appear at most once across all chunks
    expect(totalQueryClientErrorCount).toBeLessThanOrEqual(1)
    expect(totalQueryClientErrorCount).toBeGreaterThanOrEqual(1)
  })

  it('ensures vercel.json has buildCommand and outputDirectory to prevent blank deployments', () => {
    // The Vercel project builds from apps/dashboard (its Root Directory), like the example apps.
    // Without buildCommand, Vercel runs the framework default and skips the type check; the
    // output must be where `vite build` writes, or the deployed app is blank.
    expect(fs.existsSync(path.resolve(ROOT_DIR, 'vercel.json'))).toBe(false)
    expect(fs.existsSync(VERCEL_JSON_PATH)).toBe(true)
    const vercelJson = JSON.parse(fs.readFileSync(VERCEL_JSON_PATH, 'utf8'))

    expect(vercelJson.buildCommand).toBe('bun run build')
    expect(vercelJson.outputDirectory).toBe('dist')
    expect(vercelJson.installCommand).toContain('bun install')
  })

  describe('React Query Provider & Hook Context Propagation', () => {
    it('executes useThunderstorm successfully when wrapped in QueryClientProvider', () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      })

      function TestThunderstorm() {
        const status = useThunderstormQuery(60.1699, 24.9384, false)
        return React.createElement('div', { 'data-testid': 'thunder' }, status.summary)
      }

      // Should render without throwing "No QueryClient set, use QueryClientProvider to set one"
      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(TestThunderstorm)
        )
      )

      expect(html).toContain('No active thunderstorm')
    })

    it('throws "No QueryClient set" when useThunderstorm is rendered without QueryClientProvider', () => {
      function TestThunderstorm() {
        useThunderstormQuery(60.1699, 24.9384, false)
        return React.createElement('div', null, 'Should not render')
      }

      expect(() => {
        renderToString(React.createElement(TestThunderstorm))
      }).toThrow(/No QueryClient set, use QueryClientProvider to set one/)
    })

    it('executes useAirplanes successfully when wrapped in QueryClientProvider', () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      })

      function TestAirplanes() {
        const query = useAircraftQuery(60.1699, 24.9384, { relayUrl: '/configured-relay' }, false)
        return React.createElement('div', { 'data-testid': 'airplanes' }, query.status)
      }

      const html = renderToString(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(TestAirplanes)
        )
      )

      expect(html).toContain('pending')
    })

    it('throws "No QueryClient set" when useAirplanes is rendered without QueryClientProvider', () => {
      function TestAirplanes() {
        useAircraftQuery(60.1699, 24.9384, { relayUrl: '/configured-relay' }, false)
        return React.createElement('div', null, 'Should not render')
      }

      expect(() => {
        renderToString(React.createElement(TestAirplanes))
      }).toThrow(/No QueryClient set, use QueryClientProvider to set one/)
    })
  })
})
