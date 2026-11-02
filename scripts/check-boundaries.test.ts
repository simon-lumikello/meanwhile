import { expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import { checkBoundaries } from './check-boundaries'

test('boundary enforcement rejects an application-source import and a built entry point', () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), 'scripts', '.boundary-fixture-'))
  try {
    fs.mkdirSync(path.join(root, 'packages/weather/src'), { recursive: true })
    fs.mkdirSync(path.join(root, 'apps/dashboard/src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'packages/weather/package.json'), JSON.stringify({ name: '@simon-lumikello/meanwhile-weather', exports: { '.': { import: './dist/index.js' } } }))
    fs.writeFileSync(path.join(root, 'apps/dashboard/package.json'), JSON.stringify({ name: '@simon-lumikello/meanwhile-dashboard' }))
    fs.writeFileSync(path.join(root, 'packages/weather/src/core.ts'), "import '@simon-lumikello/meanwhile-dashboard'\nimport '@dashboard/features/settings'\nimport 'node:path'\nexport const forecast = true\n")
    expect(checkBoundaries({ root, requireSourceExports: true }).join('\n')).toContain('reusable package imports application source')
    expect(checkBoundaries({ root, requireSourceExports: true }).join('\n')).toContain('. must point at a file under src/')
    // An app's path alias (or any undeclared package) is not reachable from a library; Node built-ins are.
    expect(checkBoundaries({ root }).join('\n')).toContain('imports @dashboard/features/settings, which its package.json does not declare')
    expect(checkBoundaries({ root }).join('\n')).not.toContain('node:path')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('boundary enforcement requires the meanwhile- prefix on libraries and scoped apps', () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), 'scripts', '.boundary-fixture-'))
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  try {
    write('packages/ui/package.json', JSON.stringify({ name: '@simon-lumikello/ui' }))
    write('apps/dashboard/package.json', JSON.stringify({ name: '@simon-lumikello/dashboard' }))
    write('apps/weather-map/package.json', JSON.stringify({ name: 'weather-map' }))

    const violations = checkBoundaries({ root }).join('\n')
    expect(violations).toContain('@simon-lumikello/ui: workspace names must start with @simon-lumikello/meanwhile-')
    expect(violations).toContain('@simon-lumikello/dashboard: workspace names must start with @simon-lumikello/meanwhile-')
    // An unscoped app name cannot clash with a package under the scope.
    expect(violations).not.toContain('weather-map')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('boundary enforcement keeps server-only relay packages out of browser libraries', () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), 'scripts', '.boundary-fixture-'))
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  try {
    write('packages/relay/package.json', JSON.stringify({ name: '@simon-lumikello/meanwhile-relay', exports: { './aircraft': { import: './dist/aircraft.js' } } }))
    write('packages/relay/src/aircraft.ts', "import { useQuery } from '@tanstack/react-query'\nimport '@simon-lumikello/meanwhile-radar'\nexport const relay = useQuery\n")
    write('packages/radar/package.json', JSON.stringify({ name: '@simon-lumikello/meanwhile-radar', exports: { '.': { import: './dist/index.js' } }, dependencies: { '@simon-lumikello/meanwhile-relay': 'workspace:*' } }))
    write('packages/radar/src/index.ts', "import '@simon-lumikello/meanwhile-relay/aircraft'\nexport const radar = true\n")
    write('apps/dashboard/package.json', JSON.stringify({ name: '@simon-lumikello/meanwhile-dashboard' }))
    write('apps/dashboard/src/relay.ts', "import '@simon-lumikello/meanwhile-relay/aircraft'\n")

    const violations = checkBoundaries({ root }).join('\n')
    expect(violations).toContain('browser library imports server-only @simon-lumikello/meanwhile-relay/aircraft')
    expect(violations).toContain('@simon-lumikello/meanwhile-radar: package manifest depends on server-only @simon-lumikello/meanwhile-relay')
    expect(violations).toContain('server-only package imports browser dependency @tanstack/react-query')
    expect(violations).toContain('server-only package imports workspace @simon-lumikello/meanwhile-radar')
    // Applications may compose the relay.
    expect(violations).not.toMatch(/apps[\\/]dashboard/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
