import { addDays, differenceInCalendarDays, differenceInCalendarWeeks, endOfDay, isSameDay, startOfDay } from 'date-fns'
import type { CalendarEvent } from '@dashboard/features/timeline'

/**
 * Unfolds folded lines in an ICS string according to RFC 5545 (CRLF followed by whitespace).
 */
export function unfoldIcs(rawIcs: string): string {
  return rawIcs.replace(/\r?\n[ \t]/g, '')
}

/**
 * Unescapes RFC 5545 text sequences (\n, \N, \,, \;, \\) and decodes HTML tags commonly exported by Google Calendar.
 */
export function cleanIcalText(raw: string): string {
  if (!raw) return ''

  let text = raw
    // RFC 5545 specifies \n and \N for newlines
    .replace(/\\n/gi, '\n')
    // RFC 5545 escapes commas, semicolons, backslashes
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')

  // Decode common Google Calendar / Outlook HTML formatting if present
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
      .replace(/<[^>]+>/g, '') // Strip remaining HTML tags
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  }

  // Normalize excessive blank lines (more than 2 consecutive newlines)
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}

/**
 * Parses an ISO/iCal datetime string into a JavaScript Date object.
 */
export function parseIcalDate(dateStr: string): { date: Date; isAllDay: boolean } {
  // Strip property parameters if present (e.g. TZID=...:20260905T100000)
  const cleanVal = dateStr.includes(':') ? dateStr.split(':').pop()! : dateStr
  const trimmed = cleanVal.trim()

  // Date-only format (e.g. 20260905) -> All Day
  if (/^\d{8}$/.test(trimmed)) {
    const year = parseInt(trimmed.substring(0, 4), 10)
    const month = parseInt(trimmed.substring(4, 6), 10) - 1
    const day = parseInt(trimmed.substring(6, 8), 10)
    return { date: new Date(year, month, day, 0, 0, 0), isAllDay: true }
  }

  // DateTime format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (match) {
    const year = parseInt(match[1], 10)
    const month = parseInt(match[2], 10) - 1
    const day = parseInt(match[3], 10)
    const hour = parseInt(match[4], 10)
    const min = parseInt(match[5], 10)
    const sec = parseInt(match[6], 10)
    const isUtc = !!match[7]

    if (isUtc) {
      return { date: new Date(Date.UTC(year, month, day, hour, min, sec)), isAllDay: false }
    } else {
      return { date: new Date(year, month, day, hour, min, sec), isAllDay: false }
    }
  }

  // Fallback to native Date parser
  const fallback = new Date(trimmed)
  return { date: isNaN(fallback.getTime()) ? new Date() : fallback, isAllDay: false }
}

const DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

/**
 * Checks whether an RRULE rule occurs on targetDate.
 */
export function rruleMatchesDate(rruleStr: string, eventStart: Date, targetDate: Date): boolean {
  if (targetDate.getTime() < startOfDay(eventStart).getTime()) {
    return false
  }

  const parts = rruleStr.split(';').reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split('=')
    if (k && v) acc[k.toUpperCase()] = v.toUpperCase()
    return acc
  }, {})

  // UNTIL check: if targetDate is strictly after untilDate's full day
  if (parts.UNTIL) {
    const { date: untilDate } = parseIcalDate(parts.UNTIL)
    if (startOfDay(targetDate).getTime() > endOfDay(untilDate).getTime()) {
      return false
    }
  }

  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : undefined
  const freq = parts.FREQ

  if (freq === 'DAILY') {
    const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1
    // Calendar days, not elapsed ms / 24h: a spring-forward day is only 23 hours long
    const diffDays = differenceInCalendarDays(targetDate, eventStart)
    if (diffDays % interval !== 0) return false
    if (count !== undefined && Math.floor(diffDays / interval) + 1 > count) {
      return false
    }
    return true
  }

  if (freq === 'WEEKLY') {
    const targetDayOfWeek = targetDate.getDay()
    const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1
    const wkstDay = parts.WKST && DAY_MAP[parts.WKST] !== undefined ? (DAY_MAP[parts.WKST] as 0 | 1 | 2 | 3 | 4 | 5 | 6) : 1
    const diffWeeks = differenceInCalendarWeeks(targetDate, eventStart, { weekStartsOn: wkstDay })

    if (diffWeeks < 0 || diffWeeks % interval !== 0) {
      return false
    }

    if (parts.BYDAY) {
      const days = parts.BYDAY.split(',').map((d) => DAY_MAP[d.trim().slice(-2)])
      if (!days.includes(targetDayOfWeek)) {
        return false
      }
    } else if (targetDayOfWeek !== eventStart.getDay()) {
      return false
    }

    if (count !== undefined) {
      const occurrencesSoFar = Math.floor(diffWeeks / interval) + 1
      if (occurrencesSoFar > count) {
        return false
      }
    }

    return true
  }

  if (freq === 'MONTHLY') {
    const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1
    const diffMonths = (targetDate.getFullYear() - eventStart.getFullYear()) * 12 + (targetDate.getMonth() - eventStart.getMonth())
    if (diffMonths < 0 || diffMonths % interval !== 0) return false
    if (count !== undefined && Math.floor(diffMonths / interval) + 1 > count) return false
    return targetDate.getDate() === eventStart.getDate()
  }

  if (freq === 'YEARLY') {
    const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1
    const diffYears = targetDate.getFullYear() - eventStart.getFullYear()
    if (diffYears < 0 || diffYears % interval !== 0) return false
    if (count !== undefined && Math.floor(diffYears / interval) + 1 > count) return false
    return targetDate.getMonth() === eventStart.getMonth() && targetDate.getDate() === eventStart.getDate()
  }

  return false
}

/**
 * Constructs a deep-link to view or edit the event in Google Calendar web interface.
 */
export function generateGoogleCalendarUrl(
  uid?: string,
  eventUrl?: string,
  endpoint?: string,
  date?: Date
): string {
  if (eventUrl && eventUrl.startsWith('http')) {
    return eventUrl
  }

  // Extract calendar email/id from iCal feed endpoint if available
  // e.g. https://calendar.google.com/calendar/ical/user%40gmail.com/secret-.../basic.ics
  let calendarEmail = ''
  if (endpoint) {
    const match = endpoint.match(/\/calendar\/ical\/([^/]+)\//)
    if (match && match[1]) {
      calendarEmail = decodeURIComponent(match[1])
    }
  }

  if (uid) {
    // Google Calendar UIDs usually end with @google.com
    // For recurring synthetic events, strip date suffix (e.g. -2026-09-07)
    const baseUid = uid.split('@')[0].replace(/-\d{4}-\d{2}-\d{2}$/, '')
    try {
      const toEncode = calendarEmail ? `${baseUid} ${calendarEmail}` : baseUid
      const eid = btoa(toEncode).replace(/=+$/, '')
      return `https://calendar.google.com/calendar/r/eventedit/${eid}`
    } catch {
      // Fallback
    }
  }

  if (date) {
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `https://calendar.google.com/calendar/r/day/${y}/${m}/${d}`
  }

  return 'https://calendar.google.com/calendar/r'
}

interface RawVEvent {
  uid: string
  summary?: string
  description?: string
  location?: string
  url?: string
  status?: string
  dtstart?: string
  dtend?: string
  rrule?: string
  exdates: Date[]
  recurrenceId?: string
}

/**
 * Parses raw iCal/ICS text into clean CalendarEvents for a given targetDate.
 */
export function parseIcalFeed(
  rawIcs: string,
  swimlaneId: string,
  targetDate: Date,
  endpoint?: string
): CalendarEvent[] {
  const unfolded = unfoldIcs(rawIcs)
  const lines = unfolded.split(/\r?\n/)
  const rawEvents: RawVEvent[] = []

  let inEvent = false
  let curEvent: RawVEvent = {
    uid: '',
    exdates: [],
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true
      curEvent = {
        uid: '',
        exdates: [],
      }
      continue
    }

    if (trimmed === 'END:VEVENT') {
      if (inEvent && (curEvent.dtstart || curEvent.recurrenceId || curEvent.status === 'CANCELLED')) {
        if (!curEvent.uid) {
          curEvent.uid = `event-${Math.random()}`
        }
        rawEvents.push(curEvent)
      }
      inEvent = false
      continue
    }

    if (inEvent) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const rawKey = line.substring(0, colonIdx)
      const val = line.substring(colonIdx + 1)
      const key = rawKey.split(';')[0].toUpperCase()

      switch (key) {
        case 'UID':
          curEvent.uid = val.trim()
          break
        case 'SUMMARY':
          curEvent.summary = val
          break
        case 'DESCRIPTION':
          curEvent.description = val
          break
        case 'LOCATION':
          curEvent.location = val
          break
        case 'URL':
          curEvent.url = val.trim()
          break
        case 'STATUS':
          curEvent.status = val.trim().toUpperCase()
          break
        case 'RECURRENCE-ID':
          curEvent.recurrenceId = line
          break
        case 'EXDATE': {
          const dateVals = val.split(',')
          for (const dv of dateVals) {
            const parsed = parseIcalDate(dv.trim())
            curEvent.exdates.push(parsed.date)
          }
          break
        }
        case 'DTSTART':
          curEvent.dtstart = line
          break
        case 'DTEND':
          curEvent.dtend = line
          break
        case 'RRULE':
          curEvent.rrule = val
          break
      }
    }
  }

  // Pass 1: Build registries of cancellations and overrides for targetDate
  const cancelledUids = new Set<string>()
  const cancelledInstances = new Set<string>()

  for (const raw of rawEvents) {
    // If master event was cancelled entirely
    if (raw.status === 'CANCELLED' && !raw.recurrenceId) {
      cancelledUids.add(raw.uid)
      continue
    }

    // Check EXDATEs (dates explicitly excluded from the recurring series)
    for (const exdate of raw.exdates) {
      if (isSameDay(exdate, targetDate)) {
        cancelledInstances.add(raw.uid)
      }
    }

    // Check RECURRENCE-ID exceptions (single occurrences modified or cancelled)
    if (raw.recurrenceId) {
      const recParsed = parseIcalDate(raw.recurrenceId)
      // If the original occurrence was on targetDate, suppress the master synthetic recurrence for today
      if (isSameDay(recParsed.date, targetDate)) {
        cancelledInstances.add(raw.uid)
      }
    }
  }

  // Pass 2: Generate final event list for targetDate
  const events: CalendarEvent[] = []

  for (const raw of rawEvents) {
    // Skip if whole event was cancelled in Google Calendar
    if (cancelledUids.has(raw.uid)) continue

    // Handle single modified/rescheduled recurrence instances (which have RECURRENCE-ID)
    if (raw.recurrenceId) {
      if (raw.status === 'CANCELLED' || !raw.dtstart) continue

      const { date: start, isAllDay } = parseIcalDate(raw.dtstart)
      let end: Date
      if (raw.dtend) {
        end = parseIcalDate(raw.dtend).date
      } else {
        end = new Date(start.getTime() + (isAllDay ? 86400000 : 3600000))
      }

      const dayStart = startOfDay(targetDate).getTime()
      const dayEnd = startOfDay(addDays(targetDate, 1)).getTime()
      if (end.getTime() > dayStart && start.getTime() < dayEnd) {
        const title = cleanIcalText(raw.summary || 'Untitled Event')
        const description = raw.description ? cleanIcalText(raw.description) : undefined
        const location = raw.location ? cleanIcalText(raw.location) : undefined
        const googleCalendarUrl = generateGoogleCalendarUrl(raw.uid, raw.url, endpoint, start)

        events.push({
          id: `${raw.uid}-${targetDate.toISOString().slice(0, 10)}`,
          swimlaneId,
          title,
          description,
          location,
          start,
          end,
          isAllDay,
          url: raw.url,
          googleCalendarUrl,
        })
      }
      continue
    }

    // Master event must have dtstart to calculate dates
    if (!raw.dtstart || raw.status === 'CANCELLED') continue

    const title = cleanIcalText(raw.summary || 'Untitled Event')
    const description = raw.description ? cleanIcalText(raw.description) : undefined
    const location = raw.location ? cleanIcalText(raw.location) : undefined
    const { date: start, isAllDay } = parseIcalDate(raw.dtstart)

    let end: Date
    if (raw.dtend) {
      end = parseIcalDate(raw.dtend).date
    } else {
      end = new Date(start.getTime() + (isAllDay ? 86400000 : 3600000))
    }
    const durationMs = end.getTime() - start.getTime()

    // Recurring rule handling
    if (raw.rrule) {
      // Skip if this recurrence instance was cancelled or overridden via RECURRENCE-ID / EXDATE
      if (cancelledInstances.has(raw.uid)) continue

      if (rruleMatchesDate(raw.rrule, start, targetDate)) {
        const occStart = new Date(targetDate)
        occStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0)
        const occEnd = new Date(occStart.getTime() + durationMs)
        const googleCalendarUrl = generateGoogleCalendarUrl(raw.uid, raw.url, endpoint, occStart)

        events.push({
          id: `${raw.uid}-${targetDate.toISOString().slice(0, 10)}`,
          swimlaneId,
          title,
          description,
          location,
          start: occStart,
          end: occEnd,
          isAllDay,
          url: raw.url,
          googleCalendarUrl,
        })
      }
    } else {
      // Non-recurring single event
      const dayStart = startOfDay(targetDate).getTime()
      const dayEnd = startOfDay(addDays(targetDate, 1)).getTime()
      if (end.getTime() > dayStart && start.getTime() < dayEnd) {
        const googleCalendarUrl = generateGoogleCalendarUrl(raw.uid, raw.url, endpoint, start)

        events.push({
          id: raw.uid,
          swimlaneId,
          title,
          description,
          location,
          start,
          end,
          isAllDay,
          url: raw.url,
          googleCalendarUrl,
        })
      }
    }
  }

  return events
}
