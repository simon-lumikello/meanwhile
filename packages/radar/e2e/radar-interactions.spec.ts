import { test, expect } from '@playwright/test'

test.describe('Radar package fixture', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    const unexpectedRequests: string[] = []
    page.on('request', request => {
      const url = request.url()
      // In-page blob: and data: URLs (the map worker, fixture frames) never reach the network.
      if (!url.startsWith(baseURL ?? '') && !url.startsWith('blob:') && !url.startsWith('data:')) unexpectedRequests.push(url)
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Radar package fixture' })).toBeVisible()
    await expect(page.getByText('This fixture has no dashboard configuration, query provider, or network feeds.')).toBeVisible()
    await expect.poll(() => unexpectedRequests).toEqual([])
  })

  test('shows a map scale and the credits in the header, with no zoom preset button', async ({ page }) => {
    const radar = page.getByTestId('radar-host').locator('.family-radar')
    // ±20 km over the 280 px host at 60° N is about 71 m per pixel on the ground: 5 km fits in 96 px.
    const scale = page.getByTestId('radar-scale')
    await expect(scale).toHaveText('5 km')
    const bar = await scale.locator('.family-radar-scale-bar').boundingBox()
    expect(bar!.width).toBeGreaterThan(60)
    expect(bar!.width).toBeLessThanOrEqual(96)

    // The credits sit in the header row, not in a map corner, and open leftwards from their "i".
    const credits = radar.locator('.family-radar-attribution .maplibregl-ctrl-attrib')
    await expect(credits).toBeAttached()
    await expect(radar.locator('.maplibregl-control-container .maplibregl-ctrl-attrib')).toHaveCount(0)
    const closed = (await credits.boundingBox())!
    await credits.locator('.maplibregl-ctrl-attrib-button').click()
    await expect.poll(async () => (await credits.boundingBox())!.width).toBeGreaterThan(closed.width)
    const open = (await credits.boundingBox())!
    expect(open.x + open.width).toBeCloseTo(closed.x + closed.width, 0)

    await expect(page.getByTitle(/Zoom level/)).toHaveCount(0)
  })

  test('the settings dialog applies filter, renderer, and transparency together', async ({ page }) => {
    const state = page.getByTestId('radar-state')
    await expect(state).toContainText('close|clouds|radar-blocks|solid|')

    await page.getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Map settings' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('radio', { name: 'Heatmap' })).toBeChecked()
    // Transparency and lighting apply to realistic clouds only.
    await expect(dialog.getByRole('radio', { name: 'Sheer' })).toBeDisabled()

    await dialog.getByText('Rain only', { exact: true }).click()
    await dialog.getByText('Realistic clouds', { exact: true }).click()
    await expect(dialog.getByRole('radio', { name: 'Sheer' })).toBeEnabled()
    await dialog.getByText('See-through', { exact: true }).click()
    // Nothing reaches the host before Apply.
    await expect(state).toContainText('close|clouds|radar-blocks|solid|')

    await dialog.getByRole('button', { name: 'Apply' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(state).toContainText('close|rain|realistic-clouds|see-through|')
  })

  for (const renderer of ['radar-blocks', 'realistic-clouds'] as const) {
    test('Space previews the other style only while the map is focused: ' + renderer, async ({ page }) => {
      if (renderer === 'realistic-clouds') await page.goto('/?renderer=clouds')
      const map = page.getByTestId('radar-map').locator('canvas.maplibregl-canvas')
      const legend = page.getByText('Downpour', { exact: true }).and(page.locator('.font-semibold'))
      const scale = page.getByTestId('radar-scale')
      const state = page.getByTestId('radar-state')
      const heatmapSelected = renderer === 'radar-blocks'
      const expectSelected = () => heatmapSelected ? expect(legend).toBeVisible() : expect(legend).toHaveCount(0)
      const expectPreview = () => heatmapSelected ? expect(legend).toHaveCount(0) : expect(legend).toBeVisible()
      await expect(map).toBeVisible()
      await expectSelected()
      await expect(scale).toHaveText('5 km')
      const scaleBox = await scale.boundingBox()
      await map.focus()
      await page.keyboard.down('Space')
      await expectPreview()
      await expect(state).toContainText(renderer)
      // The scale keeps its corner in both styles (the legend follows it), and focus draws no ring.
      expect(await scale.boundingBox()).toEqual(scaleBox)
      await expect(map).toHaveCSS('outline-style', 'none')
      // Auto-repeat must leave the comparison held rather than toggling again.
      await page.keyboard.down('Space')
      await expectPreview()
      await page.keyboard.up('Space')
      await expectSelected()

      await page.keyboard.down('Space')
      await expectPreview()
      const outsideButton = page.getByRole('button', { name: 'Resize viewport' })
      await outsideButton.focus()
      await expectSelected()
      await page.keyboard.up('Space')
      // Space elsewhere keeps its ordinary button action and never previews the map.
      const before = await state.textContent()
      await outsideButton.press('Space')
      await expect(state).not.toHaveText(before!)
      await expectSelected()

      await map.focus()
      await page.keyboard.down('Space')
      await expectPreview()
      await page.evaluate(() => window.dispatchEvent(new Event('blur')))
      await expectSelected()
      await page.keyboard.up('Space')
      await expect(state).toContainText(renderer)
    })
  }

  test('cancelling the settings dialog discards the draft', async ({ page }) => {
    const state = page.getByTestId('radar-state')
    await page.getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Map settings' })
    await dialog.getByText('Rain only', { exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(state).toContainText('close|clouds|radar-blocks|solid|')

    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(dialog.getByRole('radio', { name: 'All clouds' })).toBeChecked()
  })

  test('fills and resizes with its host without sizing props or layout classes', async ({ page }) => {
    const host = page.getByTestId('radar-host')
    const radar = host.locator('.family-radar')
    const canvas = host.locator('canvas').first()
    const size = async () => {
      const box = (await radar.boundingBox())!
      return { width: Math.round(box.width), height: Math.round(box.height) }
    }
    // The host is smaller than the old fixed 640x400 default, which overflowed it.
    await expect.poll(size).toEqual({ width: 420, height: 280 })
    const embeddedCanvasWidth = await canvas.getAttribute('width')

    await page.getByRole('button', { name: 'Resize viewport' }).click()
    await expect(page.getByTestId('radar-state')).toContainText('wide')
    await expect.poll(size).toEqual({ width: 760, height: 460 })
    await expect.poll(async () => await canvas.getAttribute('width')).not.toBe(embeddedCanvasWidth)
  })

  test('mouse wheel zooms the map freely and the scale follows', async ({ page }) => {
    const scale = page.getByTestId('radar-scale')
    const map = page.getByTestId('radar-map')
    await expect(scale).toHaveText('5 km')
    await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible()

    const box = (await map.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -400)
    await expect.poll(async () => await scale.textContent()).not.toBe('5 km')

    // A free zoom is a view, not a preset: the host's zoom setting is untouched.
    await expect(page.getByTestId('radar-state')).toContainText('close')
    await expect(page.getByRole('button', { name: /Recenter|Back to/ })).toHaveCount(0)
  })

  test('the home marker stays on the ground while the map is dragged', async ({ page }) => {
    const map = page.getByTestId('radar-map')
    const pin = page.getByTestId('radar-home-pin')
    await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible()
    const box = (await map.boundingBox())!
    const before = (await pin.boundingBox())!

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 8 })
    await page.mouse.up()

    await expect.poll(async () => (await pin.boundingBox())!.x - before.x).toBeGreaterThan(60)
  })

  test('the built-in timeline plays scans at once and adds the forecast once it is computed', async ({ page }) => {
    await page.getByRole('button', { name: 'Timeline' }).click()
    const timeline = page.getByTestId('radar-timeline')
    const slider = timeline.getByRole('slider', { name: 'Radar timeline' })
    await expect(slider).toBeVisible()
    await expect(page.getByTestId('radar-timeline-time')).toHaveText('Now')

    // The fixture's scans are data URLs, and it has no model winds: the forecast follows the
    // surface wind from 225°, veered to a steering flow from 245°. The fixture has no Tailwind,
    // so the empty track segment has no size; it only needs to be there.
    await expect(timeline.getByTestId('radar-timeline-forecast')).toBeAttached({ timeout: 30_000 })
    await expect(page.getByTestId('radar-timeline-caption')).toContainText('To ENE')

    await slider.focus()
    await page.keyboard.press('End')
    await expect(page.getByTestId('radar-timeline-time')).toHaveText('+1 h')
    // The timeline names the forecast and its clock time; the map adds no time pill of its own.
    await expect(page.getByTestId('radar-timeline-caption')).toHaveText(/^Forecast \d{2}[.:]\d{2}$/)

    await page.keyboard.press('Home')
    await expect(page.getByTestId('radar-timeline-caption')).toHaveText('Radar scan')

    await timeline.getByRole('button', { name: 'Close timeline' }).click()
    await expect(timeline).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Timeline' })).toBeVisible()
  })
})
