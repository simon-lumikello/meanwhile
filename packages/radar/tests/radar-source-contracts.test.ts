import { expect, test } from 'bun:test'
import fs from 'node:fs'

// Source-level contracts for radar presentation.
const source = (file: string) => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf-8')

test('RadarViewport keeps no package-level persistence and uses a droplet rain pill', () => {
  const radarViewport = source('RadarViewport.tsx')
  expect(radarViewport).toContain('<Droplet')
  expect(radarViewport).not.toContain('localStorage')
})

test('RadarViewport hides the precipitation pill when no data is available rather than showing "--"', () => {
  const radarViewport = source('RadarViewport.tsx')
  expect(radarViewport).toContain('rainRate != null && Number.isFinite(rainRate)')
  expect(radarViewport).not.toContain(": '--'")
})

test('CloudRadarCanvas renders cloud shadows without clipping at canvas borders', () => {
  const cloudRadarCanvas = source('CloudRadarCanvas.tsx')
  expect(cloudRadarCanvas).not.toContain('casterUv.x >= 0.0')
  expect(cloudRadarCanvas).not.toContain('casterUv.y >= 0.0')
  expect(cloudRadarCanvas).not.toContain('casterUv.x <= 1.0')
  expect(cloudRadarCanvas).not.toContain('casterUv.y <= 1.0')
})

test('LiveRadarMap exposes filter and render mode controls', () => {
  const liveRadarMap = source('LiveRadarMap.tsx')
  expect(liveRadarMap).toContain('RadarFilterMode')
  expect(liveRadarMap).toContain('RadarRenderMode')
  expect(liveRadarMap).toContain('filterMode?: RadarFilterMode')
  expect(liveRadarMap).toContain('renderMode?: RadarRenderMode')
  expect(liveRadarMap).toContain('onFilterChange?: (nextMode: RadarFilterMode) => void')
  expect(liveRadarMap).toContain('onRenderModeChange?: (nextMode: RadarRenderMode) => void')
})
