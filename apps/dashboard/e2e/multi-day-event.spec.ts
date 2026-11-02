import { test, expect, seedDashboardConfig, createBaseConfig } from './test-helpers'

// The shared clock is frozen on Monday 2026-09-21 13:05. This shift ends the next afternoon.
const overnightCalendar = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:overnight-shift',
  'DTSTART:20260921T100000', 'DTEND:20260922T160000', 'SUMMARY:Overnight shift',
  'END:VEVENT', 'END:VCALENDAR',
].join('\r\n')

test('an event ending the next day runs to midnight and labels its end day', async ({ page }) => {
  const base = createBaseConfig()
  const lane = base.swimlanes.find(item => item.id === 'lane-dad')!
  await seedDashboardConfig(page, {
    swimlanes: [{ ...lane, source: { endpoint: '', calendarSource: 'file', localCalendarFile: { name: 'shift.ics', content: overnightCalendar } } }],
    weatherMap: { showOnTimeline: false, showOnAmbient: false },
  })
  await page.goto('/')

  const title = page.getByRole('heading', { name: 'Overnight shift', exact: true }).first()
  await expect(title).toBeVisible()
  const card = page.locator('div.absolute.rounded-xl', { has: title }).first()

  // The block starts at 10:00 and continues to the end of the day.
  const edges = await card.evaluate((el) => {
    const track = (el as HTMLElement).offsetParent!.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    return { start: (box.left - track.left) / track.width, endGap: track.right - box.right }
  })
  expect(edges.start).toBeCloseTo(10 / 24, 2)
  expect(edges.endGap).toBeLessThanOrEqual(4)

  // The label must not read like a same-day 10:00–16:00 event.
  await expect(card).toContainText('10:00 – Tue 16:00')

  await title.hover()
  await expect(page.getByText('10:00 – Tue 16:00 (30h)', { exact: true })).toBeVisible()
})
