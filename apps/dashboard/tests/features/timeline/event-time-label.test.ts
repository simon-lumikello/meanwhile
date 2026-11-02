import { describe, expect, it } from 'bun:test'
import { formatEventTimeRange } from '@dashboard/features/timeline'

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const weekday = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' })

describe('formatEventTimeRange', () => {
  it('shows plain clock times for a same-day event', () => {
    expect(formatEventTimeRange(new Date(2026, 9, 31, 10), new Date(2026, 9, 31, 16), hhmm)).toBe('10:00 – 16:00')
  })

  it('names the end day when the event ends on a later day', () => {
    const end = new Date(2026, 10, 1, 16)
    expect(formatEventTimeRange(new Date(2026, 9, 31, 10), end, hhmm)).toBe(`10:00 – ${weekday(end)} 16:00`)
    expect(formatEventTimeRange(new Date(2026, 9, 31, 10), end, hhmm, '–')).toBe(`10:00–${weekday(end)} 16:00`)
  })

  it('treats an end at the next midnight as the same day', () => {
    expect(formatEventTimeRange(new Date(2026, 9, 31, 22), new Date(2026, 10, 1), hhmm)).toBe('22:00 – 00:00')
  })

  it('adds the date when the end is a week or more later', () => {
    const end = new Date(2026, 10, 9, 12)
    const endDay = end.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    expect(formatEventTimeRange(new Date(2026, 9, 31, 10), end, hhmm)).toBe(`10:00 – ${endDay} 12:00`)
  })
})
