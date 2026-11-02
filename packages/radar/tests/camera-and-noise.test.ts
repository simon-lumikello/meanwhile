import { describe, expect, test } from 'bun:test'
import {
  createHomeCamera,
  deltaMetersToMapZoom,
  formatRadarRange,
  getCameraDeltaMeters,
  getCameraScaleBar,
  getCameraViewArea,
  isCameraAtHome,
  latLonToWebMercator,
  mapZoomToMetersPerPixel,
  projectLatLonToCamera,
  webMercatorToLatLon,
} from '../src/core'
import { computeNoiseLevel, NOISE_OCTAVE_SLOTS } from '../src/worldNoise'
import { FMI_RADAR_BOUNDS, FMI_RADAR_EXTENT_3857, createFmiRadarFrameSource } from '../src/sources/fmi'

describe('radar camera', () => {
  test('the home camera shows the preset half-height and centers the location', () => {
    const camera = createHomeCamera(60.17, 24.94, 20000, 640, 400)
    expect(getCameraDeltaMeters(camera)).toBeCloseTo(20000, 6)
    const center = projectLatLonToCamera(camera, 60.17, 24.94)
    expect(center.x).toBeCloseTo(320, 6)
    expect(center.y).toBeCloseTo(200, 6)
  })

  test('north is up and east is right on screen', () => {
    const camera = createHomeCamera(60.17, 24.94, 20000, 640, 400)
    const north = projectLatLonToCamera(camera, 60.2, 24.94)
    const east = projectLatLonToCamera(camera, 60.17, 25)
    expect(north.y).toBeLessThan(200)
    expect(east.x).toBeGreaterThan(320)
  })

  test('the view area reaches every corner on the ground', () => {
    const camera = createHomeCamera(60.17, 24.94, 20000, 640, 400)
    const area = getCameraViewArea(camera)
    expect(area.latitude).toBeCloseTo(60.17, 6)
    expect(area.longitude).toBeCloseTo(24.94, 6)
    // Half-diagonal is ~37.7 km in projected meters; at 60°N a projected meter is about half a ground meter.
    const projectedHalfDiagonalKm = Math.hypot(320, 200) * camera.metersPerPixel / 1000
    expect(area.radiusKm).toBeGreaterThan(projectedHalfDiagonalKm * 0.45)
    expect(area.radiusKm).toBeLessThan(projectedHalfDiagonalKm * 0.55)
  })

  test('map zoom and the preset half-height convert both ways', () => {
    const zoom = deltaMetersToMapZoom(35000, 400)
    expect((mapZoomToMetersPerPixel(zoom) * 400) / 2).toBeCloseTo(35000, 4)
  })

  test('mercator conversion round-trips', () => {
    const { x, y } = latLonToWebMercator(64.5, 26.1)
    const back = webMercatorToLatLon(x, y)
    expect(back.latitude).toBeCloseTo(64.5, 8)
    expect(back.longitude).toBeCloseTo(26.1, 8)
  })

  test('range labels match the preset labels at the presets', () => {
    expect(formatRadarRange(10000)).toBe('±10 km')
    expect(formatRadarRange(20000)).toBe('±20 km')
    expect(formatRadarRange(4200)).toBe('±4.2 km')
  })

  test('the scale bar spans a round ground distance that fits its maximum width', () => {
    // ±20 km over 400 px at 60° N: 100 projected meters per pixel, about 50 on the ground.
    const helsinki = getCameraScaleBar(createHomeCamera(60.17, 24.94, 20000, 640, 400), 100)
    expect(helsinki.label).toBe('2 km')
    expect(helsinki.widthPx).toBeCloseTo(2000 / (100 * Math.cos((60.17 * Math.PI) / 180)), 3)

    // The same projected scale covers twice the ground at the equator.
    expect(getCameraScaleBar(createHomeCamera(0, 24.94, 20000, 640, 400), 100).label).toBe('10 km')
    expect(getCameraScaleBar(createHomeCamera(60.17, 24.94, 500, 640, 400), 100).label).toBe('100 m')
    for (const delta of [300, 4000, 20000, 800000]) {
      const { widthPx } = getCameraScaleBar(createHomeCamera(64.5, 26.1, delta, 640, 400), 96)
      expect(widthPx).toBeGreaterThan(96 / 2.6)
      expect(widthPx).toBeLessThanOrEqual(96)
    }
  })

  test('home detection tolerates sub-pixel drift but not a real pan or zoom', () => {
    const home = createHomeCamera(60.17, 24.94, 20000, 640, 400)
    expect(isCameraAtHome({ ...home, centerX: home.centerX + home.metersPerPixel }, home)).toBe(true)
    expect(isCameraAtHome({ ...home, centerX: home.centerX + home.metersPerPixel * 40 }, home)).toBe(false)
    expect(isCameraAtHome({ ...home, metersPerPixel: home.metersPerPixel * 1.2 }, home)).toBe(false)
  })
})

describe('zoom-continuous world noise', () => {
  // Slot i holds the octave with absolute index i - base and sits at screen position
  // x = i - 1 + t. Crossing a level boundary relabels octaves by one slot; every
  // octave must keep its transform and its screen position, so nothing pops.
  const octaveAt = (level: ReturnType<typeof computeNoiseLevel>, slot: number) => Array.from(level.octaves.slice(slot * 4, slot * 4 + 4))
  const screenPosition = (level: ReturnType<typeof computeNoiseLevel>, slot: number) => slot - 1 + level.t
  const worldFrequency = (level: ReturnType<typeof computeNoiseLevel>, slot: number) => 2 ** (slot - 1) / level.levelMeters

  test('an octave keeps its world frequency, transform, and weight across a level boundary', () => {
    const below = computeNoiseLevel(32000 * 0.999999)
    const above = computeNoiseLevel(32000 * 1.000001)
    expect(above.levelMeters).toBe(below.levelMeters * 2)
    for (let slot = 0; slot < NOISE_OCTAVE_SLOTS - 1; slot++) {
      expect(worldFrequency(above, slot + 1)).toBeCloseTo(worldFrequency(below, slot), 12)
      expect(screenPosition(above, slot + 1)).toBeCloseTo(screenPosition(below, slot), 4)
      octaveAt(above, slot + 1).forEach((value, index) => expect(value).toBeCloseTo(octaveAt(below, slot)[index], 5))
    }
  })

  test('the level fraction varies continuously with the viewport span', () => {
    let previous = computeNoiseLevel(9000)
    for (let span = 9000; span < 300000; span *= 1.01) {
      const next = computeNoiseLevel(span)
      const previousFrequencies = Array.from({ length: NOISE_OCTAVE_SLOTS }, (_, slot) => worldFrequency(previous, slot))
      // Each visible octave's world frequency is either unchanged or relabeled by one slot.
      for (let slot = 0; slot < NOISE_OCTAVE_SLOTS; slot++) {
        const frequency = worldFrequency(next, slot)
        expect(previousFrequencies.some(candidate => Math.abs(candidate - frequency) / frequency < 1e-9) || slot === 0).toBe(true)
      }
      previous = next
    }
  })
})

describe('FMI whole-coverage frame source', () => {
  test('the extent contains the whole FMI coverage', () => {
    const min = latLonToWebMercator(FMI_RADAR_BOUNDS.minLat, FMI_RADAR_BOUNDS.minLon)
    const max = latLonToWebMercator(FMI_RADAR_BOUNDS.maxLat, FMI_RADAR_BOUNDS.maxLon)
    const [minX, minY, maxX, maxY] = FMI_RADAR_EXTENT_3857
    expect(minX).toBeLessThanOrEqual(min.x)
    expect(minY).toBeLessThanOrEqual(min.y)
    expect(maxX).toBeGreaterThanOrEqual(max.x)
    expect(maxY).toBeGreaterThanOrEqual(max.y)
  })

  test('frames cover the fixed extent with square pixels and never depend on the view', () => {
    const source = createFmiRadarFrameSource()
    const url = new URL(source.frameUrl({ filterMode: 'clouds', purpose: 'live', cacheKey: 7 }))
    const [minX, minY, maxX, maxY] = FMI_RADAR_EXTENT_3857
    expect(url.searchParams.get('BBOX')).toBe(`${minX},${minY},${maxX},${maxY}`)
    expect(url.searchParams.get('STYLES')).toBe('radar_rate')
    expect(url.searchParams.get('_ts')).toBe('7')
    const width = Number(url.searchParams.get('WIDTH'))
    const height = Number(url.searchParams.get('HEIGHT'))
    expect((maxX - minX) / width).toBeCloseTo((maxY - minY) / height, 0)
  })

  test('rain-only and playback frames use their own style and a lighter size', () => {
    const source = createFmiRadarFrameSource()
    const live = new URL(source.frameUrl({ filterMode: 'rain', purpose: 'live' }))
    const playback = new URL(source.frameUrl({ filterMode: 'rain', purpose: 'playback', time: '2026-09-25T10:00:00.000Z' }))
    expect(live.searchParams.get('STYLES')).toBe('radar_rate_opera')
    expect(playback.searchParams.get('TIME')).toBe('2026-09-25T10:00:00.000Z')
    expect(Number(playback.searchParams.get('WIDTH'))).toBeLessThan(Number(live.searchParams.get('WIDTH')))
  })
})
