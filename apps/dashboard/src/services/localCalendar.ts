import { unfoldIcs } from './icalParser'

export const MAX_LOCAL_CALENDAR_BYTES = 1024 * 1024

export function validateLocalCalendar(name: string, size: number, content: string): void {
  if (!/\.ics$/i.test(name)) throw new Error('Choose a calendar file ending in .ics.')
  if (size > MAX_LOCAL_CALENDAR_BYTES) throw new Error('Choose an .ics file smaller than 1 MB.')
  const text = unfoldIcs(content).trim()
  if (!/^BEGIN:VCALENDAR\r?\n/i.test(text) || !/\r?\nEND:VCALENDAR$/i.test(text)) {
    throw new Error('This file is not a valid iCalendar (.ics) calendar.')
  }
}
