import { test, expect, seedDashboardConfig } from './test-helpers'

test.describe('Mobile Responsive Layout & Lane Navigation', () => {
  // Configure mobile viewport for this suite
  test.use({ viewport: { width: 390, height: 844 } })

  test('displays mobile lane selector and toggles between 1-Lane and 2-Lanes mode', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    // Mobile lane selector must be visible
    const laneToggleBtn = page.getByRole('button', { name: 'Toggle 1 or 2 Lanes view' })
    await expect(laneToggleBtn).toBeVisible()
    await expect(laneToggleBtn).toHaveText(/1 Lane/)

    // Verify initially exactly 1 lane is pressed/selected in 1-Lane mode
    const weatherPill = page.locator('button[data-lane-id="lane-weather"]')
    const dadPill = page.locator('button[data-lane-id="lane-dad"]')
    await expect(weatherPill).toBeVisible()
    await expect(weatherPill).toHaveAttribute('aria-pressed', 'true')
    await expect(dadPill).toHaveAttribute('aria-pressed', 'false')

    // Click 1-Lane vs 2-Lanes toggle
    await laneToggleBtn.click()
    await expect(laneToggleBtn).toHaveText(/2 Lanes/)

    // Now 2 lanes should have aria-pressed="true"
    const pressedPills = page.locator('button[data-lane-id][aria-pressed="true"]')
    await expect(pressedPills).toHaveCount(2)

    // Click toggle again to switch back to 1-Lane mode
    await laneToggleBtn.click()
    await expect(laneToggleBtn).toHaveText(/1 Lane/)
    await expect(pressedPills).toHaveCount(1)
  })

  test('navigates through active lanes using Next Lane and Previous Lane stepper buttons', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    const nextLaneBtn = page.getByRole('button', { name: 'Next Lane' })
    const prevLaneBtn = page.getByRole('button', { name: 'Previous Lane' })
    await expect(nextLaneBtn).toBeVisible()
    await expect(prevLaneBtn).toBeVisible()

    const weatherPill = page.locator('button[data-lane-id="lane-weather"]')
    const dadPill = page.locator('button[data-lane-id="lane-dad"]')

    // Initially weather lane is selected
    await expect(weatherPill).toHaveAttribute('aria-pressed', 'true')
    await expect(dadPill).toHaveAttribute('aria-pressed', 'false')

    // Step to next lane (Dad)
    await nextLaneBtn.click()
    await expect(dadPill).toHaveAttribute('aria-pressed', 'true')
    await expect(weatherPill).toHaveAttribute('aria-pressed', 'false')

    // Step back to previous lane (Weather)
    await prevLaneBtn.click()
    await expect(weatherPill).toHaveAttribute('aria-pressed', 'true')
    await expect(dadPill).toHaveAttribute('aria-pressed', 'false')
  })

  test('mobile header day navigation steps days and allows tap-to-return-to-today', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    // Mobile date pill in header
    const returnToTodayBtn = page.getByTitle(/Currently viewing today|Tap to return to today/)
    await expect(returnToTodayBtn).toBeVisible()

    // Stepper buttons in mobile header
    const nextDayBtn = page.locator('header').getByRole('button', { name: 'Next Day' }).last()
    await expect(nextDayBtn).toBeVisible()
    await nextDayBtn.click()

    // Return to Today button should now indicate browsing other dates
    await expect(page.getByTitle('Tap to return to today')).toBeVisible()

    // Tap return to today
    await page.getByTitle('Tap to return to today').click()

    // Return to today should now be in currently viewing today state
    await expect(page.getByTitle('Currently viewing today')).toBeVisible()
  })
})

test.describe('Tablet Portrait Header Fit', () => {
  // iPad portrait: above the 768px mobile breakpoint, so the desktop header layout renders
  test.use({ viewport: { width: 820, height: 1180 } })

  for (const theme of ['dark', 'light'] as const) {
    test(`header does not overflow at 820px wide in ${theme} theme`, async ({ page }) => {
      await seedDashboardConfig(page, { theme })
      await page.goto('/')

      const header = page.locator('header')
      const settingsBtn = header.getByRole('button', { name: 'Settings' })
      await expect(settingsBtn).toBeVisible()

      const { scrollWidth, clientWidth } = await header.evaluate(el => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

      // Settings button must sit fully inside the viewport, not clipped on the right
      const box = await settingsBtn.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x + box!.width).toBeLessThanOrEqual(820)
    })
  }

  test('header does not overflow at the 768px mobile breakpoint boundary', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await seedDashboardConfig(page)
    await page.goto('/')

    const header = page.locator('header')
    await expect(header.getByRole('button', { name: 'Settings' })).toBeVisible()
    const { scrollWidth, clientWidth } = await header.evaluate(el => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})
