import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

// Library components use Tailwind utilities, not their stylesheets. Without these sources
// (the workspace packages' src) the utilities are silently missing.
const RENDERED_LIBRARIES = ['ambient', 'radar', 'ui']

test('Tailwind scans every rendered @simon-lumikello/meanwhile-* library', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
  for (const name of RENDERED_LIBRARIES) {
    expect(css).toContain(`@source "../../../packages/${name}/src";`)
  }
})
