import { expect, test } from '@playwright/test'

test.describe('Ambient package fixture', () => {
  test('ships aurora badge and glow styles without dashboard CSS', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/?aurora')
    const view = page.locator('[data-ambient-view][data-theme="dark"]')
    await expect(view.getByText('Aurora Visible Now · Kp 6.0')).toBeVisible()
    const card = view.locator('.aurora-card-border')
    await expect(card).toHaveCSS('animation-name', 'family-ambient-aurora-border')
    await expect(card).toHaveCSS('animation-iteration-count', '1')
    expect(await card.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none')
    await expect(view.locator('.aurora-text-shimmer')).toHaveCSS('animation-name', 'family-ambient-aurora-shimmer')
    await expect(view.locator('.aurora-pill-glow').first()).toHaveCSS('animation-name', 'family-ambient-aurora-pill')
  })

  test('renders built presentation artifacts without host lifecycle behavior', async ({ page, baseURL }) => {
    const unexpectedRequests: string[] = []
    page.on('request', request => {
      if (!request.url().startsWith(baseURL ?? '')) unexpectedRequests.push(request.url())
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Ambient package fixture' })).toBeVisible()
    await expect(page.getByText('This fixture has no dashboard configuration, query provider, or network feeds.')).toBeVisible()
    await expect(page.getByText('Weather forecast loading...').first()).toBeVisible()
    await expect(page.getByText('Weather forecast unavailable.').first()).toBeVisible()
    await expect(page.locator('[data-ambient-view][data-theme="dark"]')).toBeVisible()
    await expect(page.locator('[data-ambient-view][data-theme="light"]')).toBeVisible()
    await expect.poll(() => unexpectedRequests).toEqual([])

    await page.evaluate(() => window.scrollTo(0, 120))
    const scrollBefore = await page.evaluate(() => window.scrollY)
    await page.mouse.move(300, 200)
    await expect(page.locator('[data-ambient-view]')).toHaveCount(2)
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
    await page.keyboard.press('Space')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore)

    await page.getByRole('button', { name: 'Radar slot action' }).click()
    await expect(page.getByTestId('slot-interactions')).toHaveText('1')
  })
})
