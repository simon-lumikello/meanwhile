import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import type { SwimlaneConfig } from '@dashboard/features/settings'
import type { CalendarEvent } from '@dashboard/features/timeline'
import { calendarSourceKey, loadCalendarLaneEvents } from '@dashboard/services/calendarSource'

export function useCalendarEvents(swimlanes: SwimlaneConfig[], selectedDate: Date) {
  const dateKey = format(selectedDate, 'yyyy-MM-dd')

  const calendarLanes = swimlanes.filter((l) => l.enabled && l.type === 'google-calendar')
  const laneKey = calendarLanes.map(calendarSourceKey)

  const query = useQuery({
    queryKey: ['calendar-events', dateKey, laneKey],
    queryFn: async () => {
      const newMap: Record<string, CalendarEvent[]> = {}
      const results = await Promise.all(
        calendarLanes.map(async (lane) => ({ id: lane.id, events: await loadCalendarLaneEvents(lane, selectedDate) }))
      )

      for (const r of results) {
        newMap[r.id] = r.events
      }

      return newMap
    },
    refetchInterval: calendarLanes.some((lane) => lane.source.calendarSource !== 'file' && lane.source.endpoint) ? 5 * 60 * 1000 : false,
    staleTime: 60 * 1000,
  })

  return {
    calendarEventsByLane: query.data ?? {},
    hasLoadedCalendarsOnce: query.data !== undefined,
    isLoading: query.isLoading,
    refetchCalendars: query.refetch,
  }
}
