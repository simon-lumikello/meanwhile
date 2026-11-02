import { expect, test } from '@playwright/test'

test('weather map keeps controls reachable and explains unavailable coverage', async ({ page }) => {
  await page.route('**/*', route => {
    const url = route.request().url()
    if (url.startsWith('http://127.0.0.1:3012')) return route.continue()
    if (url.startsWith('https://geocoding-api.open-meteo.com/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ name: 'London', country: 'United Kingdom', admin1: 'England', latitude: 51.5072, longitude: -0.1276 }] }) })
    return route.fulfill({ status: 503, body: '' })
  })
  await page.addInitScript(() => localStorage.setItem('family_radar_config_v1', JSON.stringify({ latitude: 51.5072, longitude: -0.1276, location: 'London, England, United Kingdom', zoom: 'close', showBasemap: false, showAirplanes: false, filterMode: 'clouds', renderMode: 'realistic-clouds', mapStyle: 'dark-canvas' })))
  await page.goto('/')
  const viewport = await page.locator('.full-radar').evaluate(element => ({ width: element.clientWidth, height: element.clientHeight, windowWidth: window.innerWidth, windowHeight: window.innerHeight }))
  expect(viewport.width).toBe(viewport.windowWidth)
  expect(viewport.height).toBe(viewport.windowHeight)
  const canvas = await page.locator('.full-radar canvas').first().evaluate(element => ({ width: element.clientWidth, height: element.clientHeight, windowWidth: window.innerWidth, windowHeight: window.innerHeight }))
  expect(canvas.width).toBe(canvas.windowWidth)
  expect(canvas.height).toBe(canvas.windowHeight)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /Basemap/ })).toHaveCount(0)
  await expect(page.getByText(/Show aircraft over Finland from live ADS-B data/)).toBeVisible()
  await expect(page.locator('select')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Theme' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Radar scale' })).toHaveCount(0)
  const location = page.getByRole('combobox', { name: 'Search location' })
  await location.fill('London')
  const london = page.getByRole('option', { name: /London.*England, United Kingdom/ })
  await expect(london).toBeVisible()
  await london.dispatchEvent('mousedown')
  await expect(location).toHaveValue('London, England, United Kingdom')
  await expect(page.getByLabel('Latitude')).toHaveCount(0)
  await expect(page.getByLabel('Longitude')).toHaveCount(0)
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('unavailable')
  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Search location' })).toHaveValue('London, England, United Kingdom')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('family_radar_config_v1') ?? '{}'))).toMatchObject({ latitude: 51.5072, longitude: -0.1276 })
})

test('weather map draws aircraft from its same-origin relay', async ({ page }) => {
  const relayRequests: string[] = []
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:3012' && url.pathname === '/api/adsb-proxy') {
      relayRequests.push(url.search)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ now: Date.now(), ac: [
        { hex: '461f2a', flight: 'FIN7LK', lat: 60.2, lon: 24.9, alt_baro: 12000, gs: 420, track: 45, category: 'A3' },
        { hex: '4ca8e1', flight: 'EIN1DY', lat: 60.12, lon: 25.05, alt_baro: 3000, gs: 210, track: 250, category: 'A3' },
      ] }) })
    }
    if (url.origin === 'http://127.0.0.1:3012') return route.continue()
    return route.fulfill({ status: 503, body: '' })
  })
  await page.addInitScript(() => localStorage.setItem('family_radar_config_v1', JSON.stringify({ latitude: 60.1695, longitude: 24.9354, location: 'Helsinki', zoom: 'wide', showBasemap: false, showAirplanes: true, filterMode: 'rain', renderMode: 'radar-blocks', mapStyle: 'dark-canvas' })))
  await page.goto('/')

  await expect.poll(() => relayRequests).toEqual(['?region=finland'])
  // Aircraft layers are 2D canvases; count painted pixels across every canvas but the basemap.
  const paintedAircraftPixels = () => page.locator('.full-radar canvas').evaluateAll(canvases => canvases.slice(1).reduce((total, canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')
    if (!context) return total
    const { data } = context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height)
    let painted = 0
    for (let alpha = 3; alpha < data.length; alpha += 4) if (data[alpha] > 0) painted++
    return total + painted
  }, 0))
  await expect.poll(paintedAircraftPixels, { timeout: 10_000 }).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /Aircraft overlay/ })).toBeChecked()
  await expect(page.getByText(/Show aircraft over Finland from live ADS-B data/)).toBeVisible()
})

test('weather map shows the wind and rain rate at the chosen location', async ({ page }) => {
  const readings: string[] = []
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:3012') return route.continue()
    if (url.origin === 'https://api.open-meteo.com') {
      readings.push(`wind ${url.searchParams.get('latitude')},${url.searchParams.get('longitude')}`)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ current: { wind_speed_10m: 6.2, wind_direction_10m: 225, wind_gusts_10m: 11.4 } }) })
    }
    if (url.origin === 'https://openwms.fmi.fi' && url.searchParams.get('REQUEST') === 'GetFeatureInfo') {
      readings.push('rain')
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{ properties: { GRAY_INDEX: 1.23 } }] }) })
    }
    return route.fulfill({ status: 503, body: '' })
  })
  await page.addInitScript(() => localStorage.setItem('family_radar_config_v1', JSON.stringify({ latitude: 60.169512, longitude: 24.935448, location: 'Helsinki', zoom: 'close', showBasemap: false, showAirplanes: false, filterMode: 'clouds', renderMode: 'radar-blocks', mapStyle: 'dark-canvas' })))
  await page.goto('/')

  await expect(page.locator('[data-tooltip^="Wind: SW 6.2 m/s"]')).toBeVisible()
  await expect(page.getByTitle('Radar rain rate: 1.2 mm/h')).toBeVisible()
  // The location leaves the browser only rounded to about a kilometre.
  expect(readings).toContain('wind 60.17,24.94')
  expect(readings).toContain('rain')
})

test('weather map settings change nothing until applied and close on Escape or an outside click', async ({ page }) => {
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:3012') ? route.continue() : route.fulfill({ status: 503, body: '' }))
  await page.addInitScript(() => localStorage.setItem('family_radar_config_v1', JSON.stringify({ latitude: 60.1695, longitude: 24.9354, location: 'Helsinki', zoom: 'close', showBasemap: false, showAirplanes: true, filterMode: 'clouds', renderMode: 'radar-blocks', mapStyle: 'dark-canvas' })))
  await page.goto('/')
  const open = page.getByRole('button', { name: 'Settings', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Weather Map settings' })
  const aircraft = page.getByRole('checkbox', { name: /Aircraft overlay/ })
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('family_radar_config_v1') ?? '{}').showAirplanes)

  await open.click()
  await aircraft.uncheck()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(await stored()).toBe(true)

  await open.click()
  await expect(aircraft).toBeChecked()
  await aircraft.uncheck()
  await page.mouse.click(5, 5)
  await expect(dialog).toHaveCount(0)
  expect(await stored()).toBe(true)

  await open.click()
  await aircraft.uncheck()
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await stored()).toBe(false)
})

test('one settings dialog holds the map style choices beside the app settings', async ({ page }) => {
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:3012') ? route.continue() : route.fulfill({ status: 503, body: '' }))
  await page.addInitScript(() => localStorage.setItem('family_radar_config_v1', JSON.stringify({ latitude: 60.1695, longitude: 24.9354, location: 'Helsinki', zoom: 'close', showBasemap: false, showAirplanes: true, filterMode: 'clouds', renderMode: 'radar-blocks', mapStyle: 'dark-canvas' })))
  await page.goto('/')
  await expect(page.getByRole('button', { name: /settings/i })).toHaveCount(1)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Weather Map settings' })
  await expect(dialog.getByRole('combobox', { name: 'Search location' })).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Heatmap' })).toBeChecked()
  await dialog.getByText('Realistic clouds', { exact: true }).click()
  await dialog.getByText('See-through', { exact: true }).click()
  await dialog.getByText('Noon', { exact: true }).click()
  await dialog.getByRole('button', { name: 'Apply' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('family_radar_config_v1') ?? '{}'))).toMatchObject({ renderMode: 'realistic-clouds', cloudTransparency: 'see-through', cloudLighting: 'noon', showAirplanes: true })
})
