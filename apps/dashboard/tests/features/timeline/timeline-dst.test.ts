import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import type { CalendarEvent } from '@dashboard/features/timeline'
import { calculateEventPosition, getPlayheadPercent } from '@dashboard/features/timeline'
import { parseIcalFeed, rruleMatchesDate } from '@dashboard/services/icalParser'

// Finland: clocks go back 04:00 -> 03:00 on Oct 25 2026 (a 25-hour day)
// and forward 03:00 -> 04:00 on Mar 29 2026 (a 23-hour day).
const originalTz = process.env.TZ

function timedEvent(start: Date, end: Date): CalendarEvent {
  return { id: 'evt', swimlaneId: 'lane', title: 'Swimming', start, end, isAllDay: false }
}

const percentOf = (hours: number, minutes = 0) => ((hours * 60 + minutes) / 1440) * 100

describe('Timeline on daylight saving days', () => {
  beforeAll(() => {
    process.env.TZ = 'Europe/Helsinki'
  })
  afterAll(() => {
    process.env.TZ = originalTz
  })

  it('places events on the wall-clock grid on the 25-hour autumn day', () => {
    const day = new Date(2026, 9, 25)
    const pos = calculateEventPosition(
      timedEvent(new Date(2026, 9, 25, 10, 15), new Date(2026, 9, 25, 11, 30)),
      day,
      null
    )
    expect(pos?.startPercent).toBeCloseTo(percentOf(10, 15), 6)
    expect(pos?.endPercent).toBeCloseTo(percentOf(11, 30), 6)
  })

  it('keeps events and the playhead in step on the autumn day', () => {
    const day = new Date(2026, 9, 25)
    const now = new Date(2026, 9, 25, 11, 0)
    const playhead = getPlayheadPercent(now, day)
    const pos = calculateEventPosition(
      timedEvent(new Date(2026, 9, 25, 10, 15), new Date(2026, 9, 25, 11, 30)),
      day,
      playhead
    )
    expect(pos?.isInProgress).toBe(true)
    expect(pos?.progressFraction).toBeCloseTo(45 / 75, 6)
  })

  it('shows the last hour of the autumn day and stops at midnight', () => {
    const day = new Date(2026, 9, 25)
    const pos = calculateEventPosition(
      timedEvent(new Date(2026, 9, 25, 23, 0), new Date(2026, 9, 26, 1, 0)),
      day,
      null
    )
    expect(pos?.startPercent).toBeCloseTo(percentOf(23), 6)
    expect(pos?.endPercent).toBe(100)
  })

  it('places events on the wall-clock grid on the 23-hour spring day', () => {
    const day = new Date(2026, 2, 29)
    const pos = calculateEventPosition(
      timedEvent(new Date(2026, 2, 29, 18, 0), new Date(2026, 2, 29, 19, 0)),
      day,
      null
    )
    expect(pos?.startPercent).toBeCloseTo(percentOf(18), 6)
    expect(pos?.endPercent).toBeCloseTo(percentOf(19), 6)
  })

  it('ignores an event on the next day after the 23-hour spring day', () => {
    const day = new Date(2026, 2, 29)
    const nextDay = timedEvent(new Date(2026, 2, 30, 0, 30), new Date(2026, 2, 30, 1, 0))
    expect(calculateEventPosition(nextDay, day, null)).toBeNull()
  })

  it('draws a feed event at its clock time on the autumn day', () => {
    // 08:15Z is 10:15 in Helsinki after the change (UTC+2)
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:swim@test
DTSTART:20261025T081500Z
DTEND:20261025T093000Z
SUMMARY:Tessa swimming
END:VEVENT
END:VCALENDAR`
    const day = new Date(2026, 9, 25)
    const [event] = parseIcalFeed(ics, 'lane', day)
    const pos = calculateEventPosition(event, day, null)
    expect(pos?.startPercent).toBeCloseTo(percentOf(10, 15), 6)
    expect(pos?.endPercent).toBeCloseTo(percentOf(11, 30), 6)
  })

  it('keeps a weekly event set up in summer at its clock time after the change', () => {
    // Started in summer time at 16:15 local (13:15Z, UTC+3)
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:weekly-swim@test
DTSTART:20260906T131500Z
DTEND:20260906T143000Z
RRULE:FREQ=WEEKLY;BYDAY=SU
SUMMARY:Markus & Tessa swimming
END:VEVENT
END:VCALENDAR`
    const day = new Date(2026, 9, 25)
    const [event] = parseIcalFeed(ics, 'lane', day)
    const pos = calculateEventPosition(event, day, null)
    expect(pos?.startPercent).toBeCloseTo(percentOf(16, 15), 6)
    expect(pos?.endPercent).toBeCloseTo(percentOf(17, 30), 6)
  })

  it('includes a late-evening feed event in the last hour of the autumn day', () => {
    // 21:30Z is 23:30 local; a +24h day end (23:00) used to drop it
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:late@test
DTSTART:20261025T213000Z
DTEND:20261025T215000Z
SUMMARY:Late call
END:VEVENT
END:VCALENDAR`
    expect(parseIcalFeed(ics, 'lane', new Date(2026, 9, 25))).toHaveLength(1)
  })

  it('leaves a next-morning feed event off the 23-hour spring day', () => {
    // 21:30Z on Mar 29 is 00:30 local on Mar 30; a +24h day end (01:00) used to pull it in
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:early@test
DTSTART:20260329T213000Z
DTEND:20260329T214500Z
SUMMARY:Early flight
END:VEVENT
END:VCALENDAR`
    expect(parseIcalFeed(ics, 'lane', new Date(2026, 2, 29))).toHaveLength(0)
    expect(parseIcalFeed(ics, 'lane', new Date(2026, 2, 30))).toHaveLength(1)
  })

  it('counts daily recurrence intervals across the spring change', () => {
    const start = new Date(2026, 2, 28, 9, 0)
    expect(rruleMatchesDate('FREQ=DAILY;INTERVAL=2', start, new Date(2026, 2, 30))).toBe(true)
    expect(rruleMatchesDate('FREQ=DAILY;INTERVAL=2', start, new Date(2026, 2, 29))).toBe(false)
  })
})
