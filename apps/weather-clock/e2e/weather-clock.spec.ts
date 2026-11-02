import { expect, test } from '@playwright/test'

test('weather clock persists isolated settings and remains mounted during input', async ({ page }) => {
  await page.route('**/*', route => {
    const url = route.request().url()
    if (url.startsWith('http://127.0.0.1:3011')) return route.continue()
    if (url.startsWith('https://geocoding-api.open-meteo.com/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ name: 'Tampere', country: 'Finland', admin1: 'Pirkanmaa', latitude: 61.4978, longitude: 23.761 }] }) })
    return route.fulfill({ status: 503, body: '' })
  })
  await page.addInitScript(() => {
    if (!localStorage.getItem('family_ambient_config_v1')) {
      localStorage.setItem('family_ambient_config_v1', JSON.stringify({ latitude: 60.1695, longitude: 24.9354, location: 'Helsinki', providerId: 'fmi', theme: 'dark', clock24h: true, brightness: 70, showRadar: true, radarZoom: 'close', showBasemap: true, mapStyle: 'dark-canvas', filterMode: 'clouds', renderMode: 'radar-blocks' }))
    }
  })
  await page.goto('/')
  await expect(page.locator('[data-ambient-view="persistent"]')).toBeVisible()
  const radar = page.getByLabel('Weather map', { exact: true }).locator('.family-radar')
  // The map (basemap and camera) and the radar's overlay canvases must each fill the card.
  await expect(radar.getByTestId('radar-map').locator('canvas.maplibregl-canvas')).toBeVisible()
  for (const layer of [radar.getByTestId('radar-map'), radar.locator(':scope > canvas').first()]) {
    await expect(layer).toBeVisible()
    const geometry = await layer.evaluate(element => ({
      width: element.clientWidth,
      height: element.clientHeight,
      radarWidth: element.parentElement?.clientWidth,
      radarHeight: element.parentElement?.clientHeight,
      position: getComputedStyle(element).position,
    }))
    expect(geometry.width).toBe(geometry.radarWidth)
    expect(geometry.height).toBe(geometry.radarHeight)
    expect(geometry.position).toBe('absolute')
  }
  await page.getByRole('button', { name: 'Open Weather Clock settings' }).click()
  const dialogBox = await page.getByRole('dialog', { name: 'Weather Clock settings' }).boundingBox()
  const viewport = page.viewportSize()
  expect(dialogBox && viewport).toBeTruthy()
  if (dialogBox && viewport) {
    expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThan(2)
    expect(Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2)).toBeLessThan(2)
  }
  await expect(page.locator('select')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Forecast source' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Theme' })).toHaveCount(0)
  const location = page.getByRole('combobox', { name: 'Search location' })
  await location.fill('Tampere')
  await page.getByRole('option', { name: /Tampere.*Pirkanmaa, Finland/ }).click()
  await expect(location).toHaveValue('Tampere, Pirkanmaa, Finland')
  await expect(page.getByLabel('Latitude')).toHaveCount(0)
  await expect(page.getByLabel('Longitude')).toHaveCount(0)
  await page.getByLabel('Show weather map').check()
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.mouse.move(20, 20)
  await expect(page.locator('[data-ambient-view="persistent"]')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Open Weather Clock settings' }).click()
  await expect(page.getByLabel('Show weather map')).toBeChecked()
  await expect(page.getByRole('combobox', { name: 'Search location' })).toHaveValue('Tampere, Pirkanmaa, Finland')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('family_ambient_config_v1') ?? '{}'))).toMatchObject({ latitude: 61.4978, longitude: 23.761 })
})

test('weather clock settings change nothing until applied and close on Escape or an outside click', async ({ page }) => {
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:3011') ? route.continue() : route.fulfill({ status: 503, body: '' }))
  await page.addInitScript(() => localStorage.setItem('family_ambient_config_v1', JSON.stringify({ latitude: 60.1695, longitude: 24.9354, location: 'Helsinki', providerId: 'fmi', theme: 'dark', clock24h: true, brightness: 70, showRadar: false, radarZoom: 'close', showBasemap: true, mapStyle: 'dark-canvas', filterMode: 'clouds', renderMode: 'radar-blocks' })))
  await page.goto('/')
  const open = page.getByRole('button', { name: 'Open Weather Clock settings' })
  const dialog = page.getByRole('dialog', { name: 'Weather Clock settings' })
  const clock24h = page.getByLabel('24-hour clock')
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('family_ambient_config_v1') ?? '{}').clock24h)

  await open.click()
  await clock24h.uncheck()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(await stored()).toBe(true)

  await open.click()
  await expect(clock24h).toBeChecked()
  await clock24h.uncheck()
  await page.mouse.click(5, 5)
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-ambient-view="persistent"]')).toBeVisible()
  expect(await stored()).toBe(true)

  await open.click()
  await clock24h.uncheck()
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await stored()).toBe(false)
})
