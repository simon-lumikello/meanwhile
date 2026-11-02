import { test, expect, createBaseConfig, seedDashboardConfig } from './test-helpers'

test.describe('Timeline Events & Modal Dialogs', () => {
  test('renders deterministic forecast data instead of relying on a live weather service', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    await expect(page.getByText('12°', { exact: true })).toBeVisible()
  })

  test('first-launch welcome dialog appears when welcomeSeen is false, dismisses, and persists', async ({ page }) => {
    // Seed with welcomeSeen: false
    await seedDashboardConfig(page, { welcomeSeen: false })
    await page.goto('/')

    // Welcome dialog should be prominently visible
    const welcomeHeading = page.locator('h1', { hasText: 'Welcome to Meanwhile' })
    await expect(welcomeHeading).toBeVisible()

    // Dismiss welcome dialog
    const dismissBtn = page.locator('#welcome-dismiss-btn')
    await expect(dismissBtn).toBeVisible()
    await dismissBtn.click()

    // Dialog should unmount / disappear. WelcomeDialog delays onDismiss by 300ms to let its
    // fade-out animation play, so on a loaded CI runner (slow clicks/reflows) the default
    // assertion timeout can be too tight — give this one more headroom.
    await expect(welcomeHeading).not.toBeVisible({ timeout: 15000 })

    // Local storage should now have welcomeSeen: true
    const welcomeSeenInStorage = await page.evaluate(() => {
      const raw = localStorage.getItem('family_dashboard_config_v1')
      return raw ? JSON.parse(raw).welcomeSeen : null
    })
    expect(welcomeSeenInStorage).toBe(true)

    // On reload, welcome dialog should not reappear
    await page.reload()
    await expect(welcomeHeading).not.toBeVisible({ timeout: 15000 })
  })

  test('clicking event card opens EventDetailModal with correct details, and close button dismisses it', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    // Locate any rendered event card by its h4 title
    const eventCardTitle = page.locator('h4').filter({ hasText: /\w+/ }).first()
    await expect(eventCardTitle).toBeVisible()
    const eventTitleText = await eventCardTitle.innerText()

    // Click the event card to open modal
    await eventCardTitle.click()

    // Event detail modal opens, with event title rendered in h2
    const modalTitle = page.locator('h2', { hasText: eventTitleText })
    await expect(modalTitle).toBeVisible()

    // Modal close button dismisses the modal
    const closeBtn = page.getByRole('button', { name: 'Close' }).first()
    await expect(closeBtn).toBeVisible()
    await closeBtn.click()

    // Modal title should no longer be visible
    await expect(modalTitle).not.toBeVisible()
  })

  test('renders a deterministic calendar-proxy fixture instead of reaching a live calendar', async ({ page }) => {
    const config = createBaseConfig()
    config.swimlanes[1].source.endpoint = 'https://calendar.example.invalid/family.ics'
    await seedDashboardConfig(page, { swimlanes: config.swimlanes })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Fixture planning', level: 4 }).first()).toBeVisible()
  })

  test('pressing Escape closes the EventDetailModal', async ({ page }) => {
    await seedDashboardConfig(page)
    await page.goto('/')

    // Click event card
    const eventCardTitle = page.locator('h4').filter({ hasText: /\w+/ }).first()
    await expect(eventCardTitle).toBeVisible()
    const eventTitleText = await eventCardTitle.innerText()
    await eventCardTitle.click()

    const modalTitle = page.locator('h2', { hasText: eventTitleText })
    await expect(modalTitle).toBeVisible()

    // Press Escape key
    await page.keyboard.press('Escape')

    // Modal should close
    await expect(modalTitle).not.toBeVisible()
  })
})
