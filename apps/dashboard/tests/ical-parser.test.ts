import { describe, expect, it } from 'bun:test'
import { cleanIcalText, parseIcalDate, parseIcalFeed, rruleMatchesDate, unfoldIcs } from '@dashboard/services/icalParser'

describe('iCal Parser & Recurrence Engine', () => {
  it('correctly unfolds long folded lines per RFC 5545', () => {
    const folded = 'SUMMARY:This is a very long event title that spans ac\r\n ross multiple li\r\n\tnes in the ics file'
    expect(unfoldIcs(folded)).toBe('SUMMARY:This is a very long event title that spans across multiple lines in the ics file')
  })

  it('parses various iCal date formats', () => {
    // Date-only (all day)
    const allDay = parseIcalDate('20260905')
    expect(allDay.isAllDay).toBe(true)
    expect(allDay.date.getFullYear()).toBe(2026)
    expect(allDay.date.getMonth()).toBe(8) // 0-indexed Sept
    expect(allDay.date.getDate()).toBe(5)

    // DateTime with Z (UTC)
    const utcDate = parseIcalDate('20260905T103000Z')
    expect(utcDate.isAllDay).toBe(false)
    expect(utcDate.date.toISOString()).toBe('2026-09-05T10:30:00.000Z')

    // DateTime with TZID parameter
    const tzidDate = parseIcalDate('DTSTART;TZID=Europe/Helsinki:20260905T140000')
    expect(tzidDate.isAllDay).toBe(false)
    expect(tzidDate.date.getHours()).toBe(14)
    expect(tzidDate.date.getMinutes()).toBe(0)
  })

  it('correctly matches RRULE recurring weekly rules', () => {
    // Event originally starts Monday Sep 7, 2026
    const startMonday = new Date(2026, 8, 7, 9, 0, 0)

    // Check against Wednesday Sep 9, 2026
    const targetWednesday = new Date(2026, 8, 9, 9, 0, 0)
    // Check against Saturday Sep 12, 2026
    const targetSaturday = new Date(2026, 8, 12, 9, 0, 0)

    const rruleMWF = 'FREQ=WEEKLY;BYDAY=MO,WE,FR'
    expect(rruleMatchesDate(rruleMWF, startMonday, targetWednesday)).toBe(true)
    expect(rruleMatchesDate(rruleMWF, startMonday, targetSaturday)).toBe(false)

    // UNTIL check
    const rruleUntil = 'FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260908T000000Z'
    expect(rruleMatchesDate(rruleUntil, startMonday, targetWednesday)).toBe(false)
  })

  it('parses full VEVENT calendar feed into structured events', () => {
    const rawIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:test-uid-1@google.com
DTSTART:20260905T090000
DTEND:20260905T100000
SUMMARY:Team Daily Standup
LOCATION:Conference Room B
END:VEVENT
BEGIN:VEVENT
UID:test-uid-2@google.com
DTSTART:20260901T150000
DTEND:20260901T160000
RRULE:FREQ=WEEKLY;BYDAY=SA
SUMMARY:Saturday Piano Lesson
END:VEVENT
BEGIN:VEVENT
UID:test-uid-3@google.com
DTSTART:20260906T120000
DTEND:20260906T130000
SUMMARY:Tomorrow Lunch
END:VEVENT
END:VCALENDAR`

    // Target is Saturday Sep 5, 2026
    const targetDate = new Date(2026, 8, 5)
    const events = parseIcalFeed(rawIcs, 'lane-dad', targetDate)

    // Should include Daily Standup and Saturday Piano Lesson, but NOT Tomorrow Lunch
    expect(events.length).toBe(2)

    const standup = events.find((e) => e.title === 'Team Daily Standup')
    expect(standup).toBeDefined()
    expect(standup!.location).toBe('Conference Room B')

    const piano = events.find((e) => e.title === 'Saturday Piano Lesson')
    expect(piano).toBeDefined()
    expect(piano!.start.getHours()).toBe(15)
  })

  it('cleans and unescapes RFC 5545 text sequences and multiline descriptions', () => {
    // Unescape \, \; \\ and convert \n to actual newlines
    const raw = 'AaltoAlvari\\, Pitkäkatu 2\\, 40700 Jyväskylä\\, Suomi'
    expect(cleanIcalText(raw)).toBe('AaltoAlvari, Pitkäkatu 2, 40700 Jyväskylä, Suomi')

    const multiline = 'Bring gear:\\n- Swimsuit\\n- Goggles\\n\\nInstructor: Matti'
    expect(cleanIcalText(multiline)).toBe('Bring gear:\n- Swimsuit\n- Goggles\n\nInstructor: Matti')

    // Handle HTML blobs from Google Calendar
    const htmlDesc = '<html-blob>Meeting notes:<br>- Review design<br>- Discuss timeline</html-blob>'
    expect(cleanIcalText(htmlDesc)).toBe('Meeting notes:\n- Review design\n- Discuss timeline')
  })

  it('correctly filters out STATUS:CANCELLED and EXDATE exceptions', () => {
    const rawIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:cancelled-event@google.com
DTSTART:20260905T100000
DTEND:20260905T110000
STATUS:CANCELLED
SUMMARY:Old Cancelled Meeting
END:VEVENT
BEGIN:VEVENT
UID:rollo-jumppa@google.com
DTSTART:20260801T101500
DTEND:20260801T113000
RRULE:FREQ=WEEKLY;BYDAY=SA
EXDATE:20260905T101500
SUMMARY:Rollo jumppa (Cancelled on Sep 5)
END:VEVENT
BEGIN:VEVENT
UID:expired-swim@google.com
DTSTART:20240901T080000
DTEND:20240901T090000
RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=SA
SUMMARY:Expired 2024 Swim Class
END:VEVENT
BEGIN:VEVENT
UID:active-saturday@google.com
DTSTART:20260905T164500
DTEND:20260905T180000
SUMMARY:Tessa jumppa Flamingo
END:VEVENT
END:VCALENDAR`

    const targetDate = new Date(2026, 8, 5) // Sep 5, 2026
    const events = parseIcalFeed(rawIcs, 'lane-test', targetDate)

    // Only active-saturday should be present!
    expect(events.length).toBe(1)
    expect(events[0].title).toBe('Tessa jumppa Flamingo')
  })

  it('handles RECURRENCE-ID exceptions and cancellations', () => {
    const rawIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-1@google.com
DTSTART:20260901T100000
DTEND:20260901T110000
RRULE:FREQ=WEEKLY;BYDAY=SA
SUMMARY:Weekly Series
END:VEVENT
BEGIN:VEVENT
UID:series-1@google.com
RECURRENCE-ID:20260905T100000
STATUS:CANCELLED
SUMMARY:Weekly Series
END:VEVENT
END:VCALENDAR`

    const targetDate = new Date(2026, 8, 5)
    const events = parseIcalFeed(rawIcs, 'lane-test', targetDate)

    // Series was cancelled for Sep 5 via RECURRENCE-ID
    expect(events.length).toBe(0)
  })

  it('handles bi-weekly INTERVAL=2 rules starting mid-week accurately across calendar weeks', () => {
    // Event starts on Wednesday Sep 2, 2026
    const startWednesday = new Date(2026, 8, 2, 10, 0, 0)

    // Check occurrences for bi-weekly MWF: Sep 2 (Wed), Sep 4 (Fri) are week 0
    // Sep 7 (Mon), Sep 9 (Wed), Sep 11 (Fri) are week 1 (skipped)
    // Sep 14 (Mon), Sep 16 (Wed) are week 2 (active)
    const rrule = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR'

    const wedW0 = new Date(2026, 8, 2)
    const friW0 = new Date(2026, 8, 4)
    const monW1 = new Date(2026, 8, 7)
    const wedW1 = new Date(2026, 8, 9)
    const monW2 = new Date(2026, 8, 14)
    const wedW2 = new Date(2026, 8, 16)

    expect(rruleMatchesDate(rrule, startWednesday, wedW0)).toBe(true)
    expect(rruleMatchesDate(rrule, startWednesday, friW0)).toBe(true)

    // Week 1 should be false for both Monday and Wednesday
    expect(rruleMatchesDate(rrule, startWednesday, monW1)).toBe(false)
    expect(rruleMatchesDate(rrule, startWednesday, wedW1)).toBe(false)

    // Week 2 should be true for both Monday and Wednesday
    expect(rruleMatchesDate(rrule, startWednesday, monW2)).toBe(true)
    expect(rruleMatchesDate(rrule, startWednesday, wedW2)).toBe(true)
  })

  it('handles rescheduled RECURRENCE-ID event moved from Wednesday to Thursday', () => {
    const rawIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:weekly-standup@google.com
DTSTART:20260902T100000
DTEND:20260902T110000
RRULE:FREQ=WEEKLY;BYDAY=WE
SUMMARY:Weekly Standup
END:VEVENT
BEGIN:VEVENT
UID:weekly-standup@google.com
RECURRENCE-ID:20260909T100000
DTSTART:20260910T140000
DTEND:20260910T150000
SUMMARY:Rescheduled Standup
END:VEVENT
END:VCALENDAR`

    const wednesdaySep9 = new Date(2026, 8, 9)
    const thursdaySep10 = new Date(2026, 8, 10)

    // On Wednesday Sep 9, the original event was rescheduled to Thursday, so Wednesday should have 0 events
    const wedEvents = parseIcalFeed(rawIcs, 'lane-test', wednesdaySep9)
    expect(wedEvents.length).toBe(0)

    // On Thursday Sep 10, the rescheduled event should appear with its new title and time
    const thuEvents = parseIcalFeed(rawIcs, 'lane-test', thursdaySep10)
    expect(thuEvents.length).toBe(1)
    expect(thuEvents[0].title).toBe('Rescheduled Standup')
    expect(thuEvents[0].start.getHours()).toBe(14)
  })
})
