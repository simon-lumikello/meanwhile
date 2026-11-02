import type { SwimlaneConfig } from '@dashboard/features/settings/swimlane'
import type { CalendarEvent } from '@dashboard/features/timeline/calendar'
import { getMockEventsForDate } from './mockData'
import { parseIcalFeed } from './icalParser'

export function calendarSourceKey(lane: SwimlaneConfig) {
  return [lane.id, lane.source.calendarSource || 'url', lane.source.calendarSource === 'file'
    ? lane.source.localCalendarFile?.content || ''
    : lane.source.endpoint || '']
}

export async function loadCalendarLaneEvents(lane: SwimlaneConfig, selectedDate: Date): Promise<CalendarEvent[]> {
  if (lane.source.calendarSource === 'file') {
    const content = lane.source.localCalendarFile?.content
    return content ? parseIcalFeed(content, lane.id, selectedDate).map((event) => ({ ...event, googleCalendarUrl: undefined })) : []
  }
  const endpoint = lane.source.endpoint?.trim()
  if (endpoint && /^https?:\/\//i.test(endpoint)) {
    try {
      const res = await fetch(`/api/ical-proxy?url=${encodeURIComponent(endpoint)}`)
      if (res.ok) return parseIcalFeed(await res.text(), lane.id, selectedDate, endpoint)
    } catch (err) {
      console.warn(`Failed to fetch iCal feed for lane ${lane.id}, falling back to demo`, err)
    }
  }
  return getMockEventsForDate(selectedDate).filter((event) => event.swimlaneId === lane.id)
}
