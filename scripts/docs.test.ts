import { expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The docs describe commands and files that really exist.
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

const docs = Bun.spawnSync(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '*.md'], { cwd: ROOT })
  .stdout.toString().trim().split('\n')
  .filter(file => file && fs.existsSync(path.join(ROOT, file)))

function scriptsOf(dir: string): Set<string> {
  const manifest = path.join(ROOT, dir, 'package.json')
  return new Set(fs.existsSync(manifest) ? Object.keys(JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts ?? {}) : [])
}

// Build output such as `apps/dashboard/dist/` is ignored by git and exists only after a build.
function isIgnored(repoPath: string): boolean {
  return Bun.spawnSync(['git', 'check-ignore', '--quiet', '--no-index', repoPath], { cwd: ROOT }).exitCode === 0
}

function problemsIn(file: string): string[] {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
  const problems: string[] = []
  // `bun run <script>` and `bun --cwd=<dir> run <script>`; a `<placeholder>` is not a script name.
  for (const [command, cwd, name] of text.matchAll(/bun (?:--cwd[= ]([\w./-]+) )?run ([\w:.-]+)(?!<)/g)) {
    if (!scriptsOf(cwd ?? '.').has(name)) problems.push(`unknown script: ${command}`)
  }
  for (const [, target] of text.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)(?:#[^)]*)?\)/g)) {
    if (!fs.existsSync(path.join(ROOT, path.dirname(file), target))) problems.push(`broken link: ${target}`)
  }
  for (const [, repoPath] of text.matchAll(/`((?:apps|packages|scripts|docs|\.github)\/[\w./-]+)`/g)) {
    if (!fs.existsSync(path.join(ROOT, repoPath)) && !isIgnored(repoPath)) problems.push(`missing path: ${repoPath}`)
  }
  return problems
}

test('every doc names real scripts, links, and repository paths', () => {
  expect(docs.length).toBeGreaterThan(0)
  const problems = docs.flatMap(file => problemsIn(file).map(problem => `${file}: ${problem}`))
  expect(problems).toEqual([])
})
