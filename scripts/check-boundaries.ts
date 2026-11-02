import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type WorkspaceKind = 'application' | 'package'
type Layer = 'core' | 'providers' | 'query' | 'react'

interface Workspace {
  dir: string
  kind: WorkspaceKind
  manifest: Record<string, unknown>
  name: string
}

interface BoundaryOptions {
  root?: string
  requireSourceExports?: boolean
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']
/** Every library, and every app with a scoped name, is named under this prefix; other `@simon-lumikello/*` packages are external. */
const WORKSPACE_PREFIX = '@simon-lumikello/meanwhile-'
const importPattern = /(?:\bimport\s+(?:type\s+)?(?:[^'"()]+?\s+from\s+)?|\bexport\s+(?:type\s+)?(?:[^'"()]+?\s+from\s+)?|\bimport\s*\()\s*['"]([^'"]+)['"]/g

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
}

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'dist' || entry.name === 'node_modules' ? [] : walk(target)
    return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) ? [target] : []
  })
}

function importsIn(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8')
  return Array.from(source.matchAll(importPattern), (match) => match[1])
}

function resolveRelativeImport(fromFile: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(fromFile), specifier)
  const candidates = [base, ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`), ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`))]
  return candidates.find(fs.existsSync)
}

function findWorkspaces(root: string): Workspace[] {
  const candidates: Array<[string, WorkspaceKind]> = [
    ['packages', 'package'],
    ['apps', 'application'],
  ]
  return candidates.flatMap(([parent, kind]) => {
    const parentDir = path.join(root, parent)
    if (!fs.existsSync(parentDir)) return []
    return fs.readdirSync(parentDir, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) return []
      const dir = path.join(parentDir, entry.name)
      const manifestPath = path.join(dir, 'package.json')
      if (!fs.existsSync(manifestPath)) return []
      const manifest = readJson(manifestPath)
      return typeof manifest.name === 'string' ? [{ dir, kind, manifest, name: manifest.name }] : []
    })
  })
}

/** Server-side libraries (relays) run on edge runtimes and Node; browser libraries must not use them. */
function isServerOnly(workspace: Workspace): boolean {
  return workspace.kind === 'package' && workspace.name.endsWith('/meanwhile-relay')
}

/**
 * Library code that a Vite config imports (relays, `vite.ts` plugins) is loaded by Node
 * itself, not by Vite: Node strips the types but resolves only exact file names.
 */
function loadedByNode(workspace: Workspace, file: string): boolean {
  return workspace.kind === 'package' && (isServerOnly(workspace) || path.basename(file) === 'vite.ts')
}

function declaredSubpaths(manifest: Record<string, unknown>): Set<string> {
  const exports = manifest.exports
  if (!exports || typeof exports !== 'object') return new Set()
  return new Set(Object.keys(exports as Record<string, unknown>).map((key) => key === '.' ? '' : key.slice(1)))
}

function layerFor(workspace: Workspace, file: string): Layer | undefined {
  if (workspace.kind === 'application') return undefined
  const relative = path.relative(path.join(workspace.dir, 'src'), file).replaceAll('\\', '/')
  if (workspace.name.endsWith('/meanwhile-weather')) {
    if (['core.ts', 'weather.ts', 'weatherForecast.ts', 'solar.ts', 'daylight.ts', 'aurora.ts', 'auroraEvaluation.ts'].includes(relative)) return 'core'
    if (['providers.ts', 'fmiProvider.ts', 'openMeteoProvider.ts', 'noaaProvider.ts', 'locationProvider.ts', 'providerTypes.ts', 'weatherProviders.ts'].includes(relative)) return 'providers'
  }
  if (workspace.name.endsWith('/meanwhile-radar')) {
    if (['core.ts', 'types.ts', 'lightning.ts', 'camera.ts', 'mercator.ts', 'nowcast.ts'].includes(relative)) return 'core'
    if (relative.startsWith('sources/')) return 'providers'
  }
  if (workspace.name.endsWith('/meanwhile-ambient') && relative === 'core.ts') return 'core'
  if (relative === 'query.ts') return 'query'
  if (relative === 'react.ts' || relative.endsWith('.tsx') || relative === 'useRadarPositionTransition.ts') return 'react'
  return undefined
}

const allowedLayerTargets: Record<Layer, Set<Layer>> = {
  core: new Set(['core']),
  providers: new Set(['core', 'providers']),
  query: new Set(['core', 'providers', 'query']),
  react: new Set(['core', 'react']),
}

/** `react/jsx-runtime` → `react`; `@scope/name/sub` → `@scope/name`. */
function packageNameOf(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function dependencyNames(workspace: Workspace): string[] {
  const sections = ['dependencies', 'devDependencies', 'peerDependencies'] as const
  return sections.flatMap((section) => Object.keys((workspace.manifest[section] as Record<string, string> | undefined) ?? {}))
}

/** Libraries are workspace source: every public entry point is a file under src/ that exists. */
function assertSourceExports(workspace: Workspace, violations: string[]) {
  if (workspace.kind !== 'package') return
  const exports = workspace.manifest.exports as Record<string, unknown> | undefined
  if (!exports) {
    violations.push(`${workspace.name}: package manifest has no explicit exports`)
    return
  }
  for (const [subpath, entry] of Object.entries(exports)) {
    if (typeof entry !== 'string' || !entry.startsWith('./src/')) violations.push(`${workspace.name}: ${subpath} must point at a file under src/`)
    else if (!fs.existsSync(path.join(workspace.dir, entry))) violations.push(`${workspace.name}: ${subpath} points at a missing file (${entry})`)
  }
}

export function checkBoundaries(options: BoundaryOptions = {}): string[] {
  const root = options.root ?? path.resolve(fileURLToPath(new URL('..', import.meta.url)))
  const workspaces = findWorkspaces(root)
  const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]))
  const byDirectory = [...workspaces].sort((a, b) => b.dir.length - a.dir.length)
  const violations: string[] = []
  const workspaceEdges = new Map(workspaces.map((workspace) => [workspace.name, new Set<string>()]))

  for (const workspace of workspaces) {
    if (options.requireSourceExports) assertSourceExports(workspace, violations)
    if ((workspace.kind === 'package' || workspace.name.startsWith('@')) && !workspace.name.startsWith(WORKSPACE_PREFIX)) violations.push(`${workspace.name}: workspace names must start with ${WORKSPACE_PREFIX}`)
    const dependencies = new Set(dependencyNames(workspace))
    for (const file of walk(path.join(workspace.dir, 'src'))) {
      const fromLayer = layerFor(workspace, file)
      for (const specifier of importsIn(file)) {
        if (specifier.startsWith('.')) {
          if (loadedByNode(workspace, file) && !/\.tsx?$/.test(specifier)) violations.push(`${path.relative(root, file)}: Node runs this file as TypeScript, so ${specifier} needs its .ts extension`)
          const resolved = resolveRelativeImport(file, specifier)
          if (!resolved) {
            violations.push(`${path.relative(root, file)}: cannot resolve ${specifier}`)
            continue
          }
          const targetWorkspace = byDirectory.find((candidate) => resolved === candidate.dir || resolved.startsWith(`${candidate.dir}${path.sep}`))
          if (targetWorkspace && targetWorkspace !== workspace) violations.push(`${path.relative(root, file)}: relative import crosses into ${targetWorkspace.name}`)
          const targetLayer = layerFor(workspace, resolved)
          if (fromLayer && targetLayer && !allowedLayerTargets[fromLayer].has(targetLayer)) violations.push(`${path.relative(root, file)}: ${fromLayer} may not import ${targetLayer} (${specifier})`)
          continue
        }
        if (isServerOnly(workspace) && /^(?:react|react-dom|@tanstack\/)/.test(specifier)) violations.push(`${path.relative(root, file)}: server-only package imports browser dependency ${specifier}`)
        if (!specifier.startsWith(WORKSPACE_PREFIX)) {
          // A library resolves only what its manifest declares: no app path alias, no hoisted package.
          const external = !specifier.startsWith('node:') && !specifier.startsWith('virtual:')
          if (workspace.kind === 'package' && external && !dependencies.has(packageNameOf(specifier))) violations.push(`${path.relative(root, file)}: imports ${specifier}, which its package.json does not declare`)
          continue
        }
        const [name, ...rest] = specifier.split('/')
        const packageName = `${name}/${rest.shift()}`
        const target = byName.get(packageName)
        if (!target) {
          violations.push(`${path.relative(root, file)}: imports unknown workspace ${packageName}`)
          continue
        }
        const subpath = rest.length ? `/${rest.join('/')}` : ''
        if (!declaredSubpaths(target.manifest).has(subpath)) violations.push(`${path.relative(root, file)}: imports non-public ${specifier}`)
        if (workspace.kind === 'package' && target.kind === 'application') violations.push(`${path.relative(root, file)}: reusable package imports application source via ${specifier}`)
        if (isServerOnly(workspace) && target !== workspace) violations.push(`${path.relative(root, file)}: server-only package imports workspace ${specifier}`)
        if (workspace.kind === 'package' && isServerOnly(target) && target !== workspace) violations.push(`${path.relative(root, file)}: browser library imports server-only ${specifier}`)
        if (workspace.kind === 'package' && !dependencies.has(packageName)) violations.push(`${path.relative(root, file)}: missing manifest dependency on ${packageName}`)
        workspaceEdges.get(workspace.name)?.add(target.name)
      }
    }
    if (workspace.kind === 'package') {
      for (const dependency of dependencies) {
        const target = byName.get(dependency)
        if (!target) continue
        if (target.kind === 'application') violations.push(`${workspace.name}: package manifest depends on application ${dependency}`)
        if (isServerOnly(target) && target !== workspace) violations.push(`${workspace.name}: package manifest depends on server-only ${dependency}`)
        workspaceEdges.get(workspace.name)?.add(target.name)
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  function visit(name: string, trail: string[]): void {
    if (visiting.has(name)) {
      violations.push(`workspace dependency cycle: ${[...trail, name].join(' -> ')}`)
      return
    }
    if (visited.has(name)) return
    visiting.add(name)
    for (const next of workspaceEdges.get(name) ?? []) visit(next, [...trail, name])
    visiting.delete(name)
    visited.add(name)
  }
  for (const workspace of workspaces) visit(workspace.name, [])
  return violations
}

if (import.meta.main) {
  const violations = checkBoundaries({ requireSourceExports: true })
  if (violations.length) {
    console.error(`Boundary enforcement failed:\n${violations.map((violation) => `- ${violation}`).join('\n')}`)
    process.exit(1)
  }
  console.log('Boundary enforcement passed')
}
