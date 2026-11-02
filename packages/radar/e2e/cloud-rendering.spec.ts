import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { CLOUD_FIXTURE as fixture } from './clouds-fixture/fixture-config'
import capture from './clouds-fixture/radar-capture.json' with { type: 'json' }

test.use({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 })

async function openRenderer(page: Page) {
  // A changed coordinate must not silently relabel a raster captured somewhere else.
  expect(capture, 'Fixture changed: run bun packages/radar/e2e/clouds-fixture/capture.ts before reviewing new snapshots')
    .toMatchObject({ ...fixture.location, width: fixture.width, height: fixture.height,
      deltaMeters: fixture.deltaMeters, style: fixture.style })
  const errors: string[] = []
  page.on('pageerror', error => { errors.push(error.message) })
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.clock.setFixedTime(new Date(fixture.lightingTime))
  await page.route('**/*', route => new URL(route.request().url()).hostname === 'localhost'
    ? route.continue() : route.abort())
  await page.goto(`/@fs/${fileURLToPath(new URL('./clouds-fixture/renderer.html', import.meta.url)).replaceAll('\\', '/')}`)
  await page.waitForFunction(() => !!window.cloudHarness)
  return errors
}

async function frame(page: Page, time: number, name: string) {
  const result = await page.evaluate(t => window.cloudHarness.step(t), time)
  expect(result.error).toBe(0)
  expect(result.metrics.draws).toBeGreaterThan(0)
  expect(Buffer.from(result.png.split(',')[1], 'base64')).toMatchSnapshot(name, {
    threshold: 0, maxDiffPixels: 0,
  })
  return result
}

for (const isDark of [true, false]) {
  test(`captured radar clouds (${fixture.location.name}), ${isDark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    await openRenderer(page)
    await page.evaluate(isDark => window.cloudHarness.render({ isDark }), isDark)
    await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
    await frame(page, 1750, `captured-${isDark}-transition.png`)
    await frame(page, 10000, `captured-${isDark}-settled.png`)
    await frame(page, 30000, `captured-${isDark}-breathing.png`)
    if (process.env.CLOUD_BENCHMARK) {
      const timing = await page.evaluate(() => window.cloudHarness.benchmark())
      await testInfo.attach('cloud-frame-timing', { body: JSON.stringify(timing, null, 2), contentType: 'application/json' })
    }
  })
}

for (const deltaMeters of [10000, 20000, 70000]) {
  test(`blocky rain front at zoom ${deltaMeters}`, async ({ page }) => {
    await openRenderer(page)
    await page.evaluate(deltaMeters => {
      const h = window.cloudHarness
      h.render({ radarUrl: h.radarFixture(380, 240, deltaMeters), deltaMeters,
        windSpeedMs: 5, windDirectionDeg: 235 })
    }, deltaMeters)
    await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
    await frame(page, 10000, `rain-${deltaMeters}.png`)
    await frame(page, 30000, `rain-${deltaMeters}-animated.png`)
  })
}

test('rain covers the same ground at every zoom', async ({ page }) => {
  await openRenderer(page)
  const extent = 80000
  // The ground the ±10 km view shows, on a grid of about 180 m cells.
  const [width, height] = [112, 75]
  const render = (zoom: number, mode: 'clouds' | 'heatmap') => page.evaluate(async ({ extent, zoom, mode }) => {
    const h = window.cloudHarness
    h.render({ radarUrl: h.showerFixture(extent, 1.5), deltaMeters: extent, cameraDeltaMeters: zoom, mode,
      windSpeedMs: 4, windDirectionDeg: 235 }, 900, 600)
  }, { extent, zoom, mode })
  await render(10000, 'heatmap')
  await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
  // Where the heatmap draws rain: opaque, where cloud-only echoes are a faint mist.
  const heat = (await page.evaluate(({ width, height }) =>
    window.cloudHarness.groundAlpha(window.cloudHarness.step(10000).png, 1, width, height), { width, height }))
    .map(alpha => alpha > 0.55)
  // Rain frays over about 1.5 km (8 cells) either side of the radar's edge.
  const nearHeat = heat.map((_, i) => {
    const [x, y] = [i % width, Math.floor(i / width)]
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const [xx, yy] = [x + dx, y + dy]
      if (dx * dx + dy * dy <= 64 && xx >= 0 && yy >= 0 && xx < width && yy < height && heat[yy * width + xx]) return true
    }
    return false
  })
  // Rain is the same cloud as the dry cloud, darker and bluer, and white domes stand over
  // it, so it is told apart by comparison: at every zoom, cloud over the heatmap's rain is
  // bluer than cloud away from it, and cloud past the midpoint between the two stays on the
  // heatmap's rain (a shower never swells when zoomed out) and covers most of it.
  const mean = (tint: (number | null)[], pick: (i: number) => boolean) => {
    const values = tint.filter((value, i): value is number => value !== null && pick(i))
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }
  for (const zoom of [10000, 20000, 40000, 80000]) {
    await render(zoom, 'clouds')
    const tint = await page.evaluate(({ zoom, width, height }) =>
      window.cloudHarness.groundTint(window.cloudHarness.step(10000).png, 10000 / zoom, width, height), { zoom, width, height })
    const rainTint = mean(tint, i => heat[i])
    const dryTint = mean(tint, i => !nearHeat[i])
    // Neutral rain shading keeps a subtle blue bias, rather than a separate blue material.
    expect(rainTint - dryTint, `±${zoom / 1000} km: rain bluer than dry cloud`).toBeGreaterThan(0.02)
    const rain = tint.map(value => value !== null && value > (rainTint + dryTint) / 2)
    const drawn = rain.filter(Boolean).length
    const onHeat = rain.filter((r, i) => r && nearHeat[i]).length
    const shown = heat.filter((h, i) => h && rain[i]).length
    // Measured 0.97 to 0.98, and 0.75 to 0.87.
    expect(onHeat / drawn, `±${zoom / 1000} km: rain drawn on the heatmap's rain`).toBeGreaterThan(0.9)
    expect(shown / heat.filter(Boolean).length, `±${zoom / 1000} km: heatmap rain shown as rain`).toBeGreaterThan(0.65)
  }
})

test('clouds keep their outline while zooming', async ({ page }) => {
  await openRenderer(page)
  const extent = 40000
  // The ground the ±8 km view shows, on a grid of about 110 m cells.
  const [width, height] = [150, 100]
  const footprint = async (zoom: number) => {
    await page.evaluate(({ extent, zoom }) => {
      const h = window.cloudHarness
      h.render({ radarUrl: h.showerFixture(extent, 1.5), deltaMeters: extent, cameraDeltaMeters: zoom,
        windSpeedMs: 4, windDirectionDeg: 235 }, 900, 600)
    }, { extent, zoom })
    await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
    const alpha = await page.evaluate(({ zoom, width, height }) =>
      window.cloudHarness.groundAlpha(window.cloudHarness.step(10000).png, 8000 / zoom, width, height), { zoom, width, height })
    return alpha.map(value => value > 0.5)
  }
  // Where cloud is, and where its holes are, follows the radar on the ground: zooming out
  // only adds or removes the smallest domes along its edge.
  const close = await footprint(8000)
  for (const zoom of [10000, 14000, 20000, 28000, 40000]) {
    const wide = await footprint(zoom)
    const both = close.filter((c, i) => c && wide[i]).length
    const either = close.filter((c, i) => c || wide[i]).length
    // Measured 0.88 or more. The classic renderer, whose clouds follow the viewport, fell to
    // 0.61 by ±40 km.
    expect(both / either, `±${zoom / 1000} km: cloud footprint overlap with ±8 km`).toBeGreaterThan(0.8)
  }
})

test('regional coverage distinguishes a continuous deck from scattered echoes of the same intensity', async ({ page }) => {
  await openRenderer(page)
  await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#b1aff2'
    // Equal echo intensity: only the fraction of occupied coarse cells changes.
    for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) {
      if (x < 60 || (x / 2 + y / 2) % 4 === 0) ctx.fillRect(x, y, 2, 2)
    }
    window.cloudHarness.render({ radarUrl: canvas.toDataURL(), deltaMeters: 40000, cloudLighting: 'noon' }, 900, 600)
  })
  await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
  const alpha = await page.evaluate(() => {
    const h = window.cloudHarness
    return h.groundAlpha(h.step(10000).png, 1, 120, 80)
  })
  const mean = (from: number, to: number) => {
    const values = alpha.filter((_, i) => i % 120 >= from && i % 120 < to && i / 120 >= 15 && i / 120 < 65)
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }
  expect(mean(15, 45), 'continuous echoes form a substantial cloud deck').toBeGreaterThan(0.5)
  expect(mean(15, 45) - mean(75, 105), 'scattered echoes leave substantially more open sky').toBeGreaterThan(0.25)
})

for (const zoom of [20000, 80000]) {
  test(`continuous cloud coverage keeps a body beneath surface billows at ±${zoom / 1000} km`, async ({ page }) => {
    await openRenderer(page)
    await page.evaluate(zoom => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 80
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#e5d3f7'
      ctx.fillRect(0, 0, 120, 80)
      window.cloudHarness.render({ radarUrl: canvas.toDataURL(), deltaMeters: 80000,
        cameraDeltaMeters: zoom, cloudLighting: 'noon', windSpeedMs: 0 }, 900, 600)
    }, zoom)
    await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
    const result = await frame(page, 10000, 'continuous-cloud-' + zoom + '.png')
    const alpha = await page.evaluate(png => window.cloudHarness.groundAlpha(png, 0.6, 120, 80), result.png)
    expect(alpha.filter(value => value < 0.05).length / alpha.length,
      'surface texture should not punch clear holes through continuous echoes').toBeLessThan(0.05)
  })
}

test('close zoom retains the cloud body over the same ground', async ({ page }) => {
  const alphaAt = async (zoom: number) => {
    await openRenderer(page)
    await page.evaluate(zoom => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 80
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#e5d3f7'
      for (let y = 0; y < 80; y += 2) for (let x = 0; x < 120; x += 2) {
        if ((x / 2 + y / 2) % 2 === 0) ctx.fillRect(x, y, 2, 2)
      }
      window.cloudHarness.render({ radarUrl: canvas.toDataURL(), deltaMeters: 80000,
        cameraDeltaMeters: zoom, cloudLighting: 'noon', windSpeedMs: 0 }, 900, 600)
    }, zoom)
    await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
    return page.evaluate(zoom => {
      const h = window.cloudHarness
      return h.groundAlpha(h.step(10000).png, 1500 / zoom, 90, 60)
    }, zoom)
  }
  // Fresh renderers avoid temporal history carrying the wider cloud into the close view.
  const wide = await alphaAt(80000)
  const cloudy = wide.map(value => value > 0.5)
  expect(cloudy.filter(Boolean).length / cloudy.length, 'reference ground is under cloud').toBeGreaterThan(0.5)
  for (const zoom of [20000, 8000, 3000, 1500]) {
    const close = await alphaAt(zoom)
    const retained = close.filter((value, i) => cloudy[i] && value > 0.5).length
    expect(retained / cloudy.filter(Boolean).length, 'zooming in must not clear the cloud body at ±' + zoom)
      .toBeGreaterThan(0.85)
  }
})

test('zooming into a cloud edge retains its outer mass', async ({ page }) => {
  const alphaAt = async (zoom: number) => {
    await openRenderer(page)
    await page.evaluate(zoom => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 80
      const ctx = canvas.getContext('2d')!
      // A continuous cloud bank ends at the centre, with clear ground beyond it.
      ctx.fillStyle = '#e5d3f7'
      ctx.fillRect(0, 0, 120, 40)
      window.cloudHarness.render({ radarUrl: canvas.toDataURL(), deltaMeters: 80000,
        cameraDeltaMeters: zoom, cloudLighting: 'noon', windSpeedMs: 0 }, 900, 600)
    }, zoom)
    await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
    const result = await frame(page, 10000, 'cloud-edge-' + zoom + '.png')
    return page.evaluate(({ zoom, png }) => {
      const h = window.cloudHarness
      return h.groundAlpha(png, 10000 / zoom, 150, 100)
    }, { zoom, png: result.png })
  }
  // Compare fresh renders over identical ground, including the thinning outer edge.
  const wide = await alphaAt(60000)
  const edge = wide.map((alpha, i) => alpha > 0.5 && i >= 150 * 40)
  const edgeArea = edge.filter(Boolean).length
  const clear = wide.map(alpha => alpha < 0.01)
  const clearArea = clear.filter(Boolean).length
  expect(edgeArea / edge.length, 'the reference includes a substantial cloud rim').toBeGreaterThan(0.02)
  expect(clearArea / clear.length, 'the reference includes clear ground beyond the rim').toBeGreaterThan(0.2)
  for (const zoom of [30000, 20000, 10000]) {
    const close = await alphaAt(zoom)
    const retained = close.filter((alpha, i) => edge[i] && alpha > 0.5).length
    expect(retained / edgeArea, 'the outer cloud must not turn into clear sky at ±' + zoom)
      .toBeGreaterThan(0.85)
    const stillClear = close.filter((alpha, i) => clear[i] && alpha < 0.1).length
    expect(stillClear / clearArea, 'retained thickness must not spread cloud over clear ground')
      .toBeGreaterThan(0.95)
  }
})

test('thin cloud rims stay irregular at maximum map zoom', async ({ page }) => {
  await openRenderer(page)
  await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    // A weak, widespread echo exposes the smallest domes along a thinning cloud edge.
    ctx.fillStyle = '#e5d3f7'
    for (let y = 0; y < 80; y += 2) for (let x = 0; x < 120; x += 2) {
      if ((x / 2 + y / 2) % 2 === 0) ctx.fillRect(x, y, 2, 2)
    }
    // Match the tall viewport where the minimum dome size is still visible at zoom 15.
    const height = 1324
    const pixelMeters = 40075016.68557849 / (512 * 2 ** 15)
    window.cloudHarness.render({ radarUrl: canvas.toDataURL(), deltaMeters: 20000,
      cameraDeltaMeters: height / 2 * pixelMeters, cloudLighting: 'noon',
      windSpeedMs: 0 }, 2377, height)
  })
  await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
  await frame(page, 10000, 'thin-cloud-max-zoom.png')
})

test('thin cloud texture does not repeat across the map', async ({ page }) => {
  await openRenderer(page)
  await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    // A uniformly weak echo exposes surface billows without a changing weather outline.
    ctx.fillStyle = 'rgba(229, 211, 247, 0.16)'
    ctx.fillRect(0, 0, 120, 80)
    window.cloudHarness.render({ radarUrl: canvas.toDataURL(), deltaMeters: 80000,
      cameraDeltaMeters: 1000, cloudLighting: 'noon', windSpeedMs: 0 }, 900, 600)
  })
  await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
  const result = await frame(page, 10000, 'thin-cloud-texture.png')
  const alpha = await page.evaluate(png => window.cloudHarness.groundAlpha(png, 1, 900, 600), result.png)
  // Remove the broad density trend to compare the small puffs, at the old texture's
  // horizontal and vertical wrap distances, rather than the weather's overall shape.
  const width = 900
  const height = 600
  const detail = alpha.map((value, i) => {
    const x = i % width
    const y = Math.floor(i / width)
    if (x < 12 || x >= width - 12 || y < 12 || y >= height - 12) return 0
    return value - (alpha[i - 12] + alpha[i + 12] + alpha[i - 12 * width] + alpha[i + 12 * width]) / 4
  })
  const repeat = Math.round(height * 4 / (5 * 2.8))
  const correlation = (dx: number, dy: number) => {
    let a = 0, b = 0, aa = 0, bb = 0, ab = 0, count = 0
    for (let y = 20; y < height - dy - 20; y++) for (let x = 20; x < width - dx - 20; x++) {
      const first = detail[y * width + x]
      const second = detail[(y + dy) * width + x + dx]
      a += first; b += second; aa += first * first; bb += second * second; ab += first * second; count++
    }
    return (ab - a * b / count) / Math.sqrt((aa - a * a / count) * (bb - b * b / count))
  }
  const mean = alpha.reduce((sum, value) => sum + value, 0) / alpha.length
  const contrast = detail.reduce((sum, value) => sum + value * value, 0) / detail.length
  expect(mean, 'the fixture retains the thinned cloud density').toBeGreaterThan(0.7)
  expect(mean, 'the fixture must expose the thinned surface').toBeLessThan(0.9)
  expect(contrast, 'removing detail entirely must not hide repetition').toBeGreaterThan(0.0001)
  expect(Math.abs(correlation(repeat, 0)), 'horizontal puffs must not repeat as wallpaper').toBeLessThan(0.5)
  expect(Math.abs(correlation(0, repeat)), 'vertical puffs must not repeat as wallpaper').toBeLessThan(0.5)
})

test('rain-only clear and no-data regions stay free of procedural clouds', async ({ page }) => {
  await openRenderer(page)
  await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 80
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#bdbdbd'
    ctx.fillRect(60, 0, 60, 80)
    window.cloudHarness.render({ radarUrl: canvas.toDataURL(), deltaMeters: 40000, filterMode: 'rain', cloudLighting: 'noon' }, 900, 600)
  })
  await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
  const alpha = await page.evaluate(() => {
    const h = window.cloudHarness
    return h.groundAlpha(h.step(10000).png, 1, 120, 80)
  })
  expect(Math.max(...alpha)).toBe(0)
})

test('wide light viewport interpolates moving rain frames', async ({ page }) => {
  await openRenderer(page)
  await page.evaluate(() => {
    const h = window.cloudHarness
    const urls = [h.radarFixture(760, 320, 20000), h.radarFixture(760, 320, 20000, 0.04)]
    h.render({ radarUrl: urls[0], playbackUrls: urls, playbackTimestamps: ['first', 'next'],
      playbackTime: 'first', isPlaying: true, isDark: false, windSpeedMs: 5,
      windDirectionDeg: 235 }, 760, 320)
  })
  // Preloading is asynchronous; wait for both textures to be ready without advancing time.
  await expect.poll(async () => (await page.evaluate(() => window.cloudHarness.step(1))).metrics.uploads).toBe(4)
  expect((await frame(page, 1751, 'wide-moving-midpoint.png')).morph).toBeCloseTo(0.5)
  expect((await frame(page, 3501, 'wide-moving-end.png')).morph).toBe(0)
})

test('steady frames reuse resources, resizing updates resolution, and unmount cancels RAF', async ({ page }) => {
  const errors = await openRenderer(page)
  await page.evaluate(() => window.cloudHarness.render())
  await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
  // A second apart: still clouds draw at a few dozen frames a second at most.
  const first = await page.evaluate(() => window.cloudHarness.step(10000))
  const second = await page.evaluate(() => window.cloudHarness.step(11000))
  const third = await page.evaluate(() => window.cloudHarness.step(12000))
  expect(third.metrics.uniformLookups).toBe(first.metrics.uniformLookups)
  expect(third.metrics.uploads).toBe(first.metrics.uploads)
  // Every frame draws the same passes: one classic draw, or the volumetric passes.
  expect(second.metrics.draws).toBeGreaterThan(first.metrics.draws)
  expect(third.metrics.draws - second.metrics.draws).toBe(second.metrics.draws - first.metrics.draws)
  await page.evaluate(() => window.cloudHarness.render({}, 600, 300))
  await expect.poll(async () => {
    await page.evaluate(() => window.cloudHarness.step(13000))
    return page.locator('canvas').getAttribute('width')
  }).toBe('600')
  await expect(page.locator('canvas')).toHaveAttribute('height', '300')
  await page.evaluate(() => window.cloudHarness.unmount())
  expect(await page.evaluate(() => window.cloudHarness.pendingFrames())).toBe(0)
  expect(errors).toEqual([])
})

test('hidden playback sleeps and resumes without jumping over frames', async ({ page }) => {
  await openRenderer(page)
  await page.evaluate(() => {
    const h = window.cloudHarness
    const urls = [h.radarFixture(380, 240, 20000), h.radarFixture(380, 240, 20000, 0.04)]
    h.render({ radarUrl: urls[0], playbackUrls: urls, playbackTimestamps: ['first', 'next'],
      playbackTime: 'first', isPlaying: true })
  })
  await expect.poll(async () => (await page.evaluate(() => window.cloudHarness.step(1))).metrics.uploads).toBe(4)
  const before = await page.evaluate(() => window.cloudHarness.step(1751))
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const hidden = await page.evaluate(() => window.cloudHarness.step(100000))
  expect(hidden.metrics.draws).toBe(before.metrics.draws)
  expect(hidden.pending).toBe(0)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  const resumed = await page.evaluate(() => window.cloudHarness.step(100016))
  expect(resumed.morph).toBe(before.morph)
  expect(resumed.pending).toBe(1)
})

test('replacing playback URLs invalidates textures even when indices stay the same', async ({ page }) => {
  await openRenderer(page)
  await page.evaluate(() => {
    const h = window.cloudHarness
    const urls = [h.radarFixture(380, 240, 20000), h.radarFixture(380, 240, 20000, 0.04)]
    h.render({ radarUrl: urls[0], playbackUrls: urls, playbackTimestamps: ['first', 'next'], playbackTime: 'first' })
  })
  // A paused layer draws only when a frame arrives, so each image is the one from the step
  // that uploaded it, at the same time: the two differ only by their textures.
  const drawnWith = async (uploads: number) => {
    let result: Awaited<ReturnType<typeof window.cloudHarness.step>> | undefined
    await expect.poll(async () => (result = await page.evaluate(() => window.cloudHarness.step(10000))).metrics.uploads).toBe(uploads)
    return result!
  }
  const first = await drawnWith(4)
  await page.evaluate(() => {
    const h = window.cloudHarness
    const urls = [h.radarFixture(380, 240, 20000, 0.3), h.radarFixture(380, 240, 20000, 0.34)]
    h.render({ radarUrl: urls[0], playbackUrls: urls, playbackTimestamps: ['first', 'next'], playbackTime: 'first' })
  })
  const replacement = await drawnWith(6)
  expect(replacement.png).not.toBe(first.png)
  expect(replacement.error).toBe(0)
})

test('a failed next image holds the valid frame without repeated uploads', async ({ page }) => {
  await openRenderer(page)
  await page.route('**/missing-radar.png', route => route.fulfill({ status: 404, body: '' }))
  await page.evaluate(() => {
    const h = window.cloudHarness
    const url = h.radarFixture(380, 240, 20000)
    h.render({ radarUrl: url, playbackUrls: [url, '/missing-radar.png'],
      playbackTimestamps: ['first', 'next'], playbackTime: 'first', isPlaying: true })
  })
  await expect.poll(async () => (await page.evaluate(() => window.cloudHarness.step(1))).metrics.uploads).toBe(4)
  const held = await page.evaluate(() => window.cloudHarness.step(1751))
  expect(held.morph).toBe(0)
  expect(held.metrics.uploads).toBe(4)
  expect(held.error).toBe(0)
})

/** Hides the given WebGL versions from the page, as a browser without them would. */
async function withoutContexts(page: Page, hidden: string[]) {
  await page.addInitScript(hidden => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, context: string, ...args: unknown[]) {
      return hidden.includes(context) ? null : Reflect.apply(original, this, [context, ...args])
    } as typeof original
  }, hidden)
}

test('without WebGL2 the classic clouds draw', async ({ page }) => {
  await withoutContexts(page, ['webgl2'])
  const errors = await openRenderer(page)
  await page.evaluate(() => window.cloudHarness.render())
  await page.waitForFunction(() => window.cloudHarness.metrics.uploads >= 3)
  const first = await page.evaluate(() => window.cloudHarness.step(10000))
  await frame(page, 11000, 'classic-settled.png')
  const second = await page.evaluate(() => window.cloudHarness.step(12000))
  // The classic renderer draws once per frame.
  expect(second.metrics.draws).toBe(first.metrics.draws + 2)
  expect(errors).toEqual([])
})

test('WebGL unavailable falls back to the source radar image', async ({ page }) => {
  await withoutContexts(page, ['webgl', 'webgl2'])
  await openRenderer(page)
  await page.evaluate(() => window.cloudHarness.render())
  await expect(page.getByRole('img', { name: 'Weather radar' })).toHaveAttribute('src', /radar-capture\.png$/)
  await expect(page.locator('canvas')).toHaveCount(0)
})
