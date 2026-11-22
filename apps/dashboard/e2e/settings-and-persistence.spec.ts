import { test, expect, seedDashboardConfig } from './test-helpers'

test.describe('Settings Dialog & Configuration Persistence', () => {
  test('renders the dashboard radar canvas at its production viewport size', async ({ page }) => {
    await seedDashboardConfig(page, { weatherMap: { renderMode: 'radar-blocks' } })
    await page.goto('/')

    const radar = page.locator('.family-radar')
    // The map (basemap and camera) and the radar's overlay canvases must each fill the widget.
    const layers = [radar.getByTestId('radar-map'), radar.locator(':scope > canvas').first()]
    await expect(radar.getByTestId('radar-map').locator('canvas.maplibregl-canvas')).toBeVisible()
    for (const layer of layers) {
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
  })

  test('navigates between all settings tabs and displays corresponding controls', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    // Open settings
    await page.locator('header').getByRole('button', { name: 'Settings' }).click()
    const drawer = page.locator('h2', { hasText: 'Dashboard Settings' })
    await expect(drawer).toBeVisible()

    // The sections, Lanes first
    const tabsContainer = page.getByRole('tablist', { name: 'Settings sections' })
    await expect(tabsContainer.getByRole('tab', { name: /Lanes/ })).toHaveAttribute('aria-selected', 'true')
    await expect(tabsContainer.getByRole('tab', { name: /Display/ })).toBeVisible()
    await expect(tabsContainer.getByRole('tab', { name: /Ambient/ })).toBeVisible()
    await expect(tabsContainer.getByRole('tab', { name: /Weather Map/ })).toBeVisible()
    await expect(tabsContainer.getByRole('tab', { name: /Backup/ })).toBeVisible()

    // Switch to Display tab
    await tabsContainer.getByRole('tab', { name: /Display/ }).click()
    await expect(tabsContainer.getByRole('tab', { name: /Display/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Appearance & Orientation')).toBeVisible()
    await expect(page.getByText('Timeline Orientation')).toBeVisible()
    await expect(page.locator('select')).toHaveCount(0)

    // Arrow keys move between sections
    await tabsContainer.getByRole('tab', { name: /Display/ }).press('ArrowDown')
    await expect(tabsContainer.getByRole('tab', { name: /Ambient/ })).toBeFocused()
    await expect(page.getByText('Ambient Night Dimmer')).toBeVisible()

    // Switch to Weather Map tab
    await tabsContainer.getByRole('tab', { name: /Weather Map/ }).click()
    await expect(page.getByText('Show on timeline')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Weather map size' })).toBeVisible()

    // Switch to Backup tab
    await tabsContainer.getByRole('tab', { name: /Backup/ }).click()
    await expect(page.getByText('Export Configuration')).toBeVisible()

    // Close the dialog
    await page.getByRole('button', { name: 'Close Settings' }).click()
    await expect(drawer).not.toBeVisible()
  })

  test('toggles 24-hour clock in Display tab, saves, and persists across reload', async ({ page }) => {
    await seedDashboardConfig(page, { clock24h: true })
    await page.goto('/')

    // Open settings
    await page.locator('header').getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: /Display/ }).click()

    // Toggle 24-hour clock checkbox off (switching to 12h format)
    const clockCheckbox = page.locator('input[type="checkbox"]').first()
    await expect(clockCheckbox).toBeChecked()
    await clockCheckbox.uncheck()
    await expect(clockCheckbox).not.toBeChecked()

    // Apply changes
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.locator('h2', { hasText: 'Dashboard Settings' })).not.toBeVisible()
    await expect(page.locator('header')).toContainText('1:05 PM')

    // Verify localStorage has clock24h: false
    const configAfterSave = await page.evaluate(() => {
      const raw = localStorage.getItem('family_dashboard_config_v1')
      return raw ? JSON.parse(raw) : null
    })
    expect(configAfterSave.clock24h).toBe(false)

    // Reload page to verify persistence
    await page.reload()
    await expect(page.locator('header')).toContainText('1:05 PM')
    const configAfterReload = await page.evaluate(() => {
      const raw = localStorage.getItem('family_dashboard_config_v1')
      return raw ? JSON.parse(raw) : null
    })
    expect(configAfterReload.clock24h).toBe(false)
  })

  test('toggles lane visibility off and on, verifying timeline reflects change', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    // Verify Dad lane is visible initially on timeline
    await expect(page.getByRole('heading', { name: 'Dad', level: 3 })).toBeVisible()

    // Open settings (defaults to Lanes tab)
    await page.locator('header').getByRole('button', { name: 'Settings' }).click()
    await expect(page.locator('h2', { hasText: 'Dashboard Settings' })).toBeVisible()

    // Find the hide button for the calendar lane
    const hideBtn = page.getByRole('button', { name: 'Hide calendar lane' }).first()
    await expect(hideBtn).toBeVisible()
    await hideBtn.click()

    // Apply changes
    await page.getByRole('button', { name: 'Apply', exact: true }).click()

    // Dad lane should now be hidden from the timeline
    await expect(page.getByRole('heading', { name: 'Dad', level: 3 })).not.toBeVisible()

    // Reopen settings and restore lane
    await page.locator('header').getByRole('button', { name: 'Settings' }).click()
    const showBtn = page.getByRole('button', { name: 'Show calendar lane' }).first()
    await expect(showBtn).toBeVisible()
    await showBtn.click()

    // Apply changes
    await page.getByRole('button', { name: 'Apply', exact: true }).click()

    // Dad lane should be visible again
    await expect(page.getByRole('heading', { name: 'Dad', level: 3 })).toBeVisible()
  })

  test('Escape or a click outside the settings dialog discards pending edits', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')
    const drawerTitle = page.locator('h2', { hasText: 'Dashboard Settings' })

    for (const dismiss of ['escape', 'outside'] as const) {
      await page.locator('header').getByRole('button', { name: 'Settings' }).click()
      await expect(drawerTitle).toBeVisible()
      await page.locator('input[value="Dad"]').fill('Discarded Name')
      if (dismiss === 'escape') await page.keyboard.press('Escape')
      // The dialog is a centred card; the far left of the window is backdrop.
      else await page.mouse.click(5, 300)
      await expect(drawerTitle).not.toBeVisible()
      await expect(page.getByRole('heading', { name: 'Dad', level: 3 })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Discarded Name', level: 3 })).not.toBeVisible()
    }
  })

  test('quick search finds a setting by another name and jumps to it', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')
    await page.locator('header').getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Dashboard Settings' })
    const search = dialog.getByRole('combobox', { name: 'Search settings' })

    // Escape clears the search and keeps the dialog open.
    await search.fill('am pm')
    await expect(dialog.getByRole('option').first()).toContainText('24-hour clock format')
    await search.press('Escape')
    await expect(search).toHaveValue('')
    await expect(dialog).toBeVisible()

    // Enter opens the highlighted result: its section, its row, and its control focused.
    await search.fill('am pm')
    await search.press('Enter')
    await expect(dialog.getByRole('tab', { name: /Display/ })).toHaveAttribute('aria-selected', 'true')
    const clockRow = dialog.locator('[data-setting-id="clock-format"]')
    await expect(clockRow).toBeInViewport()
    await expect(clockRow.getByRole('checkbox')).toBeFocused()

    // A tap on a result works the same way.
    await search.fill('planes')
    await dialog.getByRole('option', { name: /Live flight traffic/ }).click()
    await expect(dialog.getByRole('tab', { name: /Weather Map/ })).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.locator('[data-setting-id="map-flights"]')).toBeInViewport()

    await search.fill('quokka')
    await expect(dialog.getByText('No settings match')).toBeVisible()
  })

  test('privacy details open above settings and close alone', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')
    await page.locator('header').getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Privacy & Data' }).click()
    const privacy = page.getByRole('dialog', { name: 'Privacy Policy & Data Transparency' })
    await expect(privacy).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(privacy).not.toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Dashboard Settings' })).toBeVisible()
  })

  test('searches for a weather place, keeps the dialog open on Escape, and saves it on Apply', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')
    await page.locator('header').getByRole('button', { name: 'Settings' }).click()

    const place = page.getByRole('combobox', { name: 'Search place' })
    await place.fill('Tampere')
    const tampere = page.getByRole('option', { name: /Tampere.*Pirkanmaa, Finland/ })
    await expect(tampere).toBeVisible()
    // Escape closes the suggestions only.
    await page.keyboard.press('Escape')
    await expect(tampere).not.toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Dashboard Settings' })).toBeVisible()

    await place.press('ArrowDown')
    await expect(tampere).toBeVisible()
    await place.press('Enter')
    await expect(place).toHaveValue('Tampere')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()

    const weatherLane = await page.evaluate(() => {
      const raw = localStorage.getItem('family_dashboard_config_v1')
      return raw ? JSON.parse(raw).swimlanes.find((lane: { type: string }) => lane.type === 'weather')?.source : null
    })
    expect(weatherLane).toMatchObject({ weatherLocation: 'Tampere', weatherLatitude: 61.4978, weatherLongitude: 23.761 })
  })

  test('canceling the settings dialog discards pending edits', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    // Initially Dad lane is present
    await expect(page.getByRole('heading', { name: 'Dad', level: 3 })).toBeVisible()

    // Open settings
    await page.locator('header').getByRole('button', { name: 'Settings' }).click()

    // Find input for Dad lane title
    const dadInput = page.locator('input[value="Dad"]')
    await expect(dadInput).toBeVisible()
    await dadInput.fill('Changed Name But Discarded')

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Timeline still displays "Dad", not "Changed Name But Discarded"
    await expect(page.getByRole('heading', { name: 'Dad', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Changed Name But Discarded', level: 3 })).not.toBeVisible()
  })
})
