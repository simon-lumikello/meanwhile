import { afterAll, afterEach, describe, expect, it, spyOn } from 'bun:test'
import { calendarSourceKey, loadCalendarLaneEvents } from '../src/services/calendarSource'
import { MAX_LOCAL_CALENDAR_BYTES, validateLocalCalendar } from '../src/services/localCalendar'
import { createDefaultCalendarLane } from '../src/features/settings/defaultConfig'

const calendar = (title: string) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:local-event',
  'DTSTART:20260921T130000', 'DTEND:20260921T140000',
  `SUMMARY:${title}`, 'RRULE:FREQ=DAILY', 'END:VEVENT', 'END:VCALENDAR',
].join('\r\n')
const date = new Date(2026, 8, 22)
const fetchSpy = spyOn(globalThis, 'fetch')

afterEach(() => { fetchSpy.mockClear() })
afterAll(() => { fetchSpy.mockRestore() })

describe('local calendar source', () => {
  it('parses recurring events locally even if a previous feed URL remains in the config', async () => {
    const lane = createDefaultCalendarLane(0)
    lane.source = { endpoint: 'https://calendar.example/private.ics', calendarSource: 'file', localCalendarFile: { name: 'family.ics', content: calendar('Private appointment') } }
    const events = await loadCalendarLaneEvents(lane, date)
    expect(events.map(event => event.title)).toEqual(['Private appointment'])
    expect(events[0].swimlaneId).toBe(lane.id)
    expect(events[0].start.getDate()).toBe(22)
    expect(events[0].googleCalendarUrl).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not fetch or show demo events when a file source has no imported calendar', async () => {
    const lane = createDefaultCalendarLane(0)
    lane.source = { endpoint: 'https://calendar.example/private.ics', calendarSource: 'file' }
    expect(await loadCalendarLaneEvents(lane, date)).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('invalidates calendar cache keys when file contents change, including the same filename', () => {
    const lane = createDefaultCalendarLane(0)
    lane.source = { endpoint: '', calendarSource: 'file', localCalendarFile: { name: 'family.ics', content: calendar('Before') } }
    const before = calendarSourceKey(lane)
    lane.source.localCalendarFile!.content = calendar('After')
    expect(calendarSourceKey(lane)).not.toEqual(before)
  })

  it('keeps older URL configurations working', async () => {
    const lane = createDefaultCalendarLane(0)
    lane.source.endpoint = 'https://calendar.example/private.ics'
    fetchSpy.mockResolvedValueOnce(new Response(calendar('Remote appointment')))
    expect((await loadCalendarLaneEvents(lane, date))[0].title).toBe('Remote appointment')
    expect(fetchSpy).toHaveBeenCalledWith('/api/ical-proxy?url=https%3A%2F%2Fcalendar.example%2Fprivate.ics')
  })

  it('accepts empty calendars, BOMs, and uppercase file extensions', () => {
    expect(() => validateLocalCalendar('FAMILY.ICS', 100, '\uFEFFBEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n')).not.toThrow()
  })

  it('rejects non-calendar content, wrong extensions, and oversized imports', () => {
    expect(() => validateLocalCalendar('family.ics', 10, 'not a calendar')).toThrow('valid iCalendar')
    expect(() => validateLocalCalendar('family.txt', 100, calendar('Event'))).toThrow('ending in .ics')
    expect(() => validateLocalCalendar('family.ics', MAX_LOCAL_CALENDAR_BYTES + 1, calendar('Event'))).toThrow('smaller than 1 MB')
  })
})
