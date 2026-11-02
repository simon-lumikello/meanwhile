import { test, expect, seedDashboardConfig } from './test-helpers'

test.describe('Header Bar & Navigation Interactions', () => {
  test('day navigation quick switchers (Yesterday, Today, Tomorrow) update view', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    const header = page.locator('header')
    await expect(header).toBeVisible()

    // The Today button carries today's short date instead of the word "Today"
    const todayBtn = header.getByTestId('header-today-button')
    await expect(todayBtn).toBeVisible()
    await expect(todayBtn).toHaveText(/\d/)
    await expect(todayBtn).toHaveAttribute('aria-pressed', 'true')

    // Click "Tomorrow"
    const tomorrowBtn = header.getByRole('button', { name: 'Tomorrow' })
    await expect(tomorrowBtn).toBeVisible()
    await tomorrowBtn.click()
    await expect(tomorrowBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(todayBtn).toHaveAttribute('aria-pressed', 'false')

    // Return to Today
    await todayBtn.click()
    await expect(todayBtn).toHaveAttribute('aria-pressed', 'true')

    // Click "Yesterday"
    const yesterdayBtn = header.getByRole('button', { name: 'Yesterday' })
    await expect(yesterdayBtn).toBeVisible()
    await yesterdayBtn.click()
    await expect(yesterdayBtn).toHaveAttribute('aria-pressed', 'true')

    // Return to Today
    await todayBtn.click()
    await expect(todayBtn).toHaveAttribute('aria-pressed', 'true')
    // Nearby days need no separate date label
    await expect(header.getByTestId('header-date-display')).toHaveCount(0)
  })

  test('day navigation chevron steppers step calendar dates forward and backward', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    const header = page.locator('header')
    await expect(header).toBeVisible()

    const dateDisplay = header.getByTestId('header-date-display')
    const todayBtn = header.getByTestId('header-today-button')
    await expect(todayBtn).toHaveAttribute('aria-pressed', 'true')

    // Two days ahead is past the quick switchers, so the date label appears
    const nextDayBtn = header.getByRole('button', { name: 'Next Day' }).first()
    await expect(nextDayBtn).toBeVisible()
    await nextDayBtn.click()
    await nextDayBtn.click()
    await expect(dateDisplay).toBeVisible()
    const twoDaysAheadText = await dateDisplay.innerText()

    // Three days ahead shows a different date
    await nextDayBtn.click()
    await expect(dateDisplay).not.toHaveText(twoDaysAheadText)

    // Previous Day (chevron stepper) steps back
    const prevDayBtn = header.getByRole('button', { name: 'Previous Day' }).first()
    await expect(prevDayBtn).toBeVisible()
    await prevDayBtn.click()
    await expect(dateDisplay).toHaveText(twoDaysAheadText)
    await prevDayBtn.click()
    await prevDayBtn.click()
    await expect(todayBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(dateDisplay).toHaveCount(0)
  })

  test('theme toggle switches between light and dark modes and persists preference', async ({ page }) => {
    await seedDashboardConfig(page, { theme: 'dark' })
    await page.goto('/')

    // Verify html element has dark class initially
    const htmlElement = page.locator('html')
    await expect(htmlElement).toHaveClass(/dark/)

    // Locate theme toggle button in header
    const themeToggleBtn = page.locator('header').getByRole('button', { name: 'Toggle Theme' })
    await expect(themeToggleBtn).toBeVisible()

    // Click theme toggle to switch to Light theme
    await themeToggleBtn.click()

    // HTML should no longer have 'dark' class
    await expect(htmlElement).not.toHaveClass(/dark/)

    // Verify localStorage has persisted 'light'
    const storedTheme = await page.evaluate(() => {
      const raw = localStorage.getItem('family_dashboard_config_v1')
      return raw ? JSON.parse(raw).theme : null
    })
    expect(storedTheme).toBe('light')

    // Reload page to verify persistence
    await page.reload()
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    // Click again to toggle back to Dark theme
    const reloadedThemeBtn = page.locator('header').getByRole('button', { name: 'Toggle Theme' })
    await reloadedThemeBtn.click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('settings button in header opens settings drawer', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    const settingsBtn = page.locator('header').getByRole('button', { name: 'Settings' })
    await expect(settingsBtn).toBeVisible()
    await settingsBtn.click()

    // Drawer should open and display title
    const drawerTitle = page.locator('h2', { hasText: 'Dashboard Settings' })
    await expect(drawerTitle).toBeVisible()

    // Close settings via close button
    const closeBtn = page.getByRole('button', { name: 'Close Settings' })
    await expect(closeBtn).toBeVisible()
    await closeBtn.click()

    // Drawer should close
    await expect(drawerTitle).not.toBeVisible()
  })
})
