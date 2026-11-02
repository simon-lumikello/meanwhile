import { test, expect, seedDashboardConfig, createBaseConfig } from './test-helpers'

const calendar = (title: string) => Buffer.from([
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:private-local',
  'DTSTART:20260921T130000', 'DTEND:20260921T140000', `SUMMARY:${title}`,
  'END:VEVENT', 'END:VCALENDAR',
].join('\r\n'))

for (const theme of ['dark', 'light'] as const) {
  test(`imports, replaces, and removes a local calendar without relay requests in ${theme} mode`, async ({ page }) => {
    const base = createBaseConfig()
    await seedDashboardConfig(page, {
      theme,
      swimlanes: base.swimlanes.filter(lane => lane.id === 'lane-dad'),
      weatherMap: { showOnTimeline: false, showOnAmbient: false },
    })
    const relayRequests: string[] = []
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/ical-proxy') relayRequests.push(request.url())
    })
    await page.goto('/')
    const openSettings = () => page.locator('header').getByRole('button', { name: 'Settings' }).click()
    await openSettings()
    await page.getByRole('button', { name: 'Calendar source for Dad' }).click()
    await page.getByRole('option', { name: 'Local .ics file' }).click()
    const input = page.getByLabel('Import calendar (.ics)')
    const selectFile = (title: string) => input.setInputFiles({ name: 'private.ics', mimeType: 'text/calendar', buffer: calendar(title) })
    await selectFile('Private local appointment')
    await expect(page.getByRole('status')).toContainText('Selected: private.ics')
    const screenshot = test.info().outputPath('calendar-source-settings.png')
    await page.screenshot({ path: screenshot })
    await test.info().attach('calendar-source-settings', { path: screenshot, contentType: 'image/png' })
    // Imported data remains a draft until Apply.
    expect(await page.evaluate(() => localStorage.getItem('family_dashboard_config_v1'))).not.toContain('Private local appointment')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await openSettings()
    await expect(page.getByRole('button', { name: 'Calendar source for Dad' })).toContainText('Calendar URL')
    await page.getByRole('button', { name: 'Calendar source for Dad' }).click()
    await page.getByRole('option', { name: 'Local .ics file' }).click()
    await selectFile('Private local appointment')
    await expect(page.getByRole('status')).toContainText('Selected: private.ics')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    // The event card also renders an overflow-preview heading; assert the main card.
    await expect(page.getByRole('heading', { name: 'Private local appointment', exact: true }).first()).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Private local appointment', exact: true }).first()).toBeVisible()
    await page.getByRole('heading', { name: 'Private local appointment', exact: true }).first().click()
    const details = page.getByRole('dialog', { name: 'Private local appointment' })
    await expect(details.getByText('Imported calendar', { exact: true })).toBeVisible()
    await expect(details.getByRole('link', { name: 'Open in Google Calendar' })).toHaveCount(0)
    await details.getByRole('button', { name: 'Close', exact: true }).first().click()
    await openSettings()
    // An invalid replacement leaves the previous import intact.
    await input.setInputFiles({ name: 'invalid.ics', mimeType: 'text/calendar', buffer: Buffer.from('invalid calendar') })
    await expect(page.getByRole('alert')).toContainText('not a valid iCalendar')
    await expect(page.getByRole('status')).toContainText('Selected: private.ics')
    await selectFile('Replacement local appointment')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('Selected: private.ics')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Replacement local appointment', exact: true }).first()).toBeVisible()
    await expect(page.getByText('Private local appointment', { exact: true })).toHaveCount(0)
    await openSettings()
    await page.getByRole('button', { name: 'Remove imported calendar' }).click()
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByText('Replacement local appointment', { exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Replacement local appointment', { exact: true })).toHaveCount(0)
    expect(relayRequests).toEqual([])
  })
}

test('keeps the settings draft open and the saved calendar intact when browser storage is full', async ({ page }) => {
  const base = createBaseConfig()
  const lane = base.swimlanes.find(item => item.id === 'lane-dad')!
  await seedDashboardConfig(page, {
    swimlanes: [{ ...lane, source: { endpoint: '', calendarSource: 'file', localCalendarFile: { name: 'before.ics', content: calendar('Saved appointment').toString() } } }],
    weatherMap: { showOnTimeline: false, showOnAmbient: false },
  })
  await page.goto('/')
  await page.locator('header').getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Import calendar (.ics)').setInputFiles({ name: 'after.ics', mimeType: 'text/calendar', buffer: calendar('Unsaved appointment') })
  await expect(page.getByRole('status')).toContainText('Selected: after.ics')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'family_dashboard_config_v1') throw new DOMException('Storage full', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not save settings')
  await expect(page.getByRole('dialog', { name: 'Dashboard Settings' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('family_dashboard_config_v1'))).toContain('Saved appointment')
  expect(await page.evaluate(() => localStorage.getItem('family_dashboard_config_v1'))).not.toContain('Unsaved appointment')
})
