import { differenceInCalendarDays } from 'date-fns'

/**
 * Formats an event's clock-time range. An end on a later day carries its day ("10:00 – Tue 16:00"),
 * so a block that runs to midnight never reads like a same-day event. Ending exactly at midnight
 * stays a same-day range.
 */
export function formatEventTimeRange(
  start: Date,
  end: Date,
  formatTime: (d: Date) => string,
  separator = ' – '
): string {
  const lastMoment = end.getTime() > start.getTime() ? new Date(end.getTime() - 1) : end
  const daysLater = differenceInCalendarDays(lastMoment, start)
  if (daysLater < 1) return `${formatTime(start)}${separator}${formatTime(end)}`

  const endDay = end.toLocaleDateString(
    undefined,
    daysLater < 7 ? { weekday: 'short' } : { weekday: 'short', month: 'short', day: 'numeric' }
  )
  return `${formatTime(start)}${separator}${endDay} ${formatTime(end)}`
}
