import { test, expect, seedDashboardConfig } from './test-helpers'

interface PlainHttpWindow extends Window {
  readClipboard?: () => Promise<string>
}

test.describe('Self-hosting guide', () => {
  test('copies the Docker command where the Clipboard API is missing, as over plain HTTP', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    // A self-hosted display at http://192.168.x.x:3000 is not a secure context, so the page has no
    // Clipboard API. Keep a way to read the clipboard for the assertion, then take the API away.
    await page.addInitScript(() => {
      const clipboard = navigator.clipboard
      ;(window as PlainHttpWindow).readClipboard = () => clipboard.readText()
      Object.defineProperty(window, 'isSecureContext', { value: false })
      Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => undefined })
    })
    await seedDashboardConfig(page)
    await page.goto('/')

    await page.locator('header').getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: /Backup/ }).click()
    await page.getByRole('button', { name: 'Self-Hosting Guide' }).click()
    const guide = page.getByRole('dialog', { name: 'Self-Hosting Guide' })
    await expect(guide).toBeVisible()

    const quickstart = guide.locator('section').filter({ hasText: 'One-Command Docker Quickstart' })
    await quickstart.getByRole('button', { name: 'Copy' }).click()
    await expect(quickstart.getByRole('button', { name: 'Copied' })).toBeVisible()
    const copied = await page.evaluate(() => (window as PlainHttpWindow).readClipboard?.())
    expect(copied).toContain('ghcr.io/simon-lumikello/meanwhile:latest')

    // The confirmation clears itself, and only the button that was used shows it.
    await expect(guide.getByRole('button', { name: 'Copied' })).toHaveCount(0, { timeout: 5000 })
    await expect(guide.getByRole('button', { name: 'Copy' })).toHaveCount(3)
  })
})
