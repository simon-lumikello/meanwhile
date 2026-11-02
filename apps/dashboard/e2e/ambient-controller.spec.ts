import { expect, test } from '@playwright/test'

test.describe('Dashboard ambient controller', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-21T22:30:00+03:00') })
    await page.addInitScript(() => {
      const counts = { added: 0, removed: 0 }
      const add = window.addEventListener.bind(window)
      const remove = window.removeEventListener.bind(window)
      window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
        if (['mousemove', 'keydown', 'touchstart', 'pointerdown'].includes(type)) counts.added += 1
        add(type, listener, options)
      }) as typeof window.addEventListener
      window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
        if (['mousemove', 'keydown', 'touchstart', 'pointerdown'].includes(type)) counts.removed += 1
        remove(type, listener, options)
      }) as typeof window.removeEventListener
      window.ambientListenerCounts = counts
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard ambient controller fixture' })).toBeVisible()
  })

  test('gates entry, wakes temporarily, and removes listeners through rollover and unmount', async ({ page }) => {
    const controller = page.getByTestId('dashboard-ambient-controller')
    // After loading, the ambient screen waits for 30 seconds without interaction.
    await expect(page.getByTestId('ambient-visibility')).toHaveText('false')
    await page.clock.fastForward(20_000)
    await page.mouse.move(200, 200)
    await page.clock.fastForward(20_000)
    await expect(controller).not.toBeVisible()
    await page.clock.fastForward(10_001)
    await expect(controller).toBeVisible()
    await expect(page.getByTestId('ambient-visibility')).toHaveText('true')

    await page.mouse.move(300, 300)
    await expect(controller).toHaveClass(/animate-dimmer-fade-out/)
    await page.clock.fastForward(350)
    await expect(controller).not.toBeVisible()
    await page.mouse.move(350, 350)
    await expect(controller).not.toBeVisible()
    await page.clock.fastForward(30_001)
    await expect(controller).toBeVisible()

    await page.evaluate(() => window.setAmbientScenario?.({ time: '2026-09-22T07:15:00+03:00' }))
    await expect(controller).not.toBeVisible()
    await page.mouse.move(400, 400)
    await expect(controller).not.toBeVisible()

    await page.evaluate(() => window.setAmbientScenario?.({ time: '2026-09-22T00:01:00+03:00' }))
    await expect(controller).toBeVisible()

    await page.evaluate(() => window.setAmbientScenario?.({ mounted: false }))
    await expect(controller).not.toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const counts = window.ambientListenerCounts
      return counts ? counts.removed >= counts.added : false
    })).toBe(true)
  })

  test('stays on the lock screen at midnight while the new day forecasts load', async ({ page }) => {
    const controller = page.getByTestId('dashboard-ambient-controller')
    await page.clock.fastForward(30_001)
    await expect(controller).toBeVisible()
    await page.evaluate(() => {
      const state = window as Window & { ambientUnmounts?: number }
      state.ambientUnmounts = 0
      new MutationObserver(() => {
        if (!document.querySelector('[data-testid="dashboard-ambient-controller"]')) state.ambientUnmounts! += 1
      }).observe(document.body, { childList: true, subtree: true })
    })

    // At midnight the forecast queries move to the new dates and are briefly empty.
    await page.evaluate(() => window.setAmbientScenario?.({ time: '2026-09-22T00:00:00+03:00', tomorrowEmpty: true }))
    await page.clock.fastForward(2_000)
    await page.evaluate(() => window.setAmbientScenario?.({ tomorrowEmpty: false }))
    await expect(controller).toBeVisible()
    expect(await page.evaluate(() => (window as Window & { ambientUnmounts?: number }).ambientUnmounts)).toBe(0)
  })
})
