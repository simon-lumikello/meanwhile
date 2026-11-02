import { addDays, endOfDay, isSameDay, startOfDay } from 'date-fns'
import type { CalendarEvent, PositionedEvent } from './calendar'

export const MINUTES_IN_DAY = 1440

/**
 * Places a moment on the day's 24-hour wall-clock axis (0 to 1440), clamped to the day.
 * Uses the local clock reading rather than elapsed time since midnight, so events line up
 * with the hour grid and playhead on DST days (the repeated autumn hour shares its slot).
 */
function wallClockMinutes(date: Date, dayStartMs: number, dayEndMs: number): number {
  if (date.getTime() <= dayStartMs) return 0
  if (date.getTime() >= dayEndMs) return MINUTES_IN_DAY
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

/**
 * Calculates the playhead's percentage position (0 to 100) across the 24-hour day.
 * Returns null if the targetDate is not today.
 */
export function getPlayheadPercent(currentTime: Date, targetDate: Date): number | null {
  if (!isSameDay(currentTime, targetDate)) {
    return null
  }

  const hours = currentTime.getHours()
  const minutes = currentTime.getMinutes()
  const seconds = currentTime.getSeconds()

  const totalMinutes = hours * 60 + minutes + seconds / 60
  return Math.min(100, Math.max(0, (totalMinutes / MINUTES_IN_DAY) * 100))
}

/**
 * Calculates the percentage position and split-progress muting parameters for an event.
 * Returns null if the event does not overlap with the targetDate.
 */
export function calculateEventPosition(
  event: CalendarEvent,
  targetDate: Date,
  playheadPercent: number | null
): PositionedEvent | null {
  const dayStart = startOfDay(targetDate)
  // The next local midnight, not +24h: DST days last 23 or 25 hours
  const dayEndMs = startOfDay(addDays(dayStart, 1)).getTime()

  const eventStart = new Date(event.start)
  const eventEnd = new Date(event.end)

  // Discard if the event is completely outside targetDate
  if (eventEnd.getTime() <= dayStart.getTime() || eventStart.getTime() >= dayEndMs) {
    return null
  }

  const startMinutes = wallClockMinutes(eventStart, dayStart.getTime(), dayEndMs)
  const endMinutes = wallClockMinutes(eventEnd, dayStart.getTime(), dayEndMs)

  const startPercent = Math.min(100, Math.max(0, (startMinutes / MINUTES_IN_DAY) * 100))
  const endPercent = Math.min(100, Math.max(0, (endMinutes / MINUTES_IN_DAY) * 100))
  const widthPercent = Math.max(0.6, endPercent - startPercent) // Minimum width for glanceability

  let isPast = false
  let isFuture = false
  let isInProgress = false
  let progressFraction = 0
  let splitOffsetPercent = 0

  if (playheadPercent !== null) {
    if (endPercent <= playheadPercent) {
      isPast = true
      progressFraction = 1
      splitOffsetPercent = 100
    } else if (startPercent >= playheadPercent) {
      isFuture = true
      progressFraction = 0
      splitOffsetPercent = 0
    } else {
      isInProgress = true
      const totalSpan = widthPercent
      if (totalSpan > 0) {
        progressFraction = Math.min(1, Math.max(0, (playheadPercent - startPercent) / totalSpan))
        splitOffsetPercent = progressFraction * 100
      }
    }
  } else {
    // If not today: check if targetDate is in past or future
    const now = new Date()
    if (targetDate.getTime() < startOfDay(now).getTime()) {
      isPast = true
      progressFraction = 1
    } else {
      isFuture = true
      progressFraction = 0
    }
  }

  return {
    ...event,
    startPercent,
    endPercent,
    widthPercent,
    isPast,
    isFuture,
    isInProgress,
    progressFraction,
    splitOffsetPercent,
  }
}

/**
 * Assigns tracks (sub-rows/columns) to events that overlap in time within the same swimlane.
 * Prevents overlapping events from obscuring each other.
 */
export function assignEventTracks(events: PositionedEvent[]): PositionedEvent[] {
  if (events.length === 0) return []

  // Sort by startPercent ascending, then by endPercent descending
  const sorted = [...events].sort((a, b) => {
    if (Math.abs(a.startPercent - b.startPercent) > 0.01) {
      return a.startPercent - b.startPercent
    }
    return b.endPercent - a.endPercent
  })

  // Group into overlapping clusters
  const clusters: PositionedEvent[][] = []
  let currentCluster: PositionedEvent[] = []
  let clusterEnd = -1

  for (const evt of sorted) {
    if (currentCluster.length === 0) {
      currentCluster.push(evt)
      clusterEnd = evt.endPercent
    } else if (evt.startPercent < clusterEnd) {
      currentCluster.push(evt)
      clusterEnd = Math.max(clusterEnd, evt.endPercent)
    } else {
      clusters.push(currentCluster)
      currentCluster = [evt]
      clusterEnd = evt.endPercent
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster)
  }

  const result: PositionedEvent[] = []

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      result.push({
        ...cluster[0],
        trackIndex: 0,
        totalTracks: 1,
      })
      continue
    }

    // Allocate sub-tracks using greedy interval scheduling (support up to 4 tracks cleanly)
    const MAX_TRACKS = 4
    const trackEndTimes: number[] = []
    const clusterAssigned: { event: PositionedEvent; track: number }[] = []

    for (const evt of cluster) {
      let assignedTrack = -1
      for (let t = 0; t < trackEndTimes.length; t++) {
        if (trackEndTimes[t] <= evt.startPercent) {
          trackEndTimes[t] = evt.endPercent
          assignedTrack = t
          break
        }
      }
      if (assignedTrack === -1) {
        if (trackEndTimes.length < MAX_TRACKS) {
          trackEndTimes.push(evt.endPercent)
          assignedTrack = trackEndTimes.length - 1
        } else {
          // Find track whose active event finishes earliest to minimize overlapping
          let earliestTrack = 0
          let earliestTime = trackEndTimes[0]
          for (let t = 1; t < trackEndTimes.length; t++) {
            if (trackEndTimes[t] < earliestTime) {
              earliestTime = trackEndTimes[t]
              earliestTrack = t
            }
          }
          trackEndTimes[earliestTrack] = evt.endPercent
          assignedTrack = earliestTrack
        }
      }
      clusterAssigned.push({ event: evt, track: assignedTrack })
    }

    const totalTracks = Math.max(1, trackEndTimes.length)

    for (const item of clusterAssigned) {
      result.push({
        ...item.event,
        trackIndex: item.track,
        totalTracks,
      })
    }
  }

  return result
}

/**
 * Options for determining whether remaining events exist for today.
 */
export interface RemainingEventsOptions {
  /** Grace period in seconds after an event ends before dimming. Defaults to 30. */
  graceSeconds?: number
  /** Grace period in minutes (legacy). If provided, converted to milliseconds. */
  graceMinutes?: number
  /** Whether to ignore all-day events when checking for active events. Defaults to true. */
  ignoreAllDay?: boolean
  /**
   * Whether days with zero timed events should be dimmed.
   * Defaults to true (promptly dims days that have no events scheduled).
   */
  dimZeroEventDays?: boolean
  /**
   * If dimZeroEventDays is false, the hour (0-23) after which the display dims.
   * Defaults to 18 (6:00 PM).
   */
  emptyDayCutoffHour?: number
  /**
   * Minimum hour of the day before the display can dim due to completed events.
   * Defaults to 0 (can dim anytime after the final event of the day completes).
   */
  minHour?: number
}

/**
 * Checks if there are any ongoing or upcoming events scheduled for today.
 * Returns false if all events for today have already concluded (plus optional grace period),
 * or if there are no events today (dimZeroEventDays = true).
 */
export function hasRemainingEventsToday(
  events: CalendarEvent[],
  currentTime: Date,
  options: RemainingEventsOptions = {}
): boolean {
  const {
    graceSeconds = 30,
    graceMinutes,
    ignoreAllDay = true,
    dimZeroEventDays = true,
    emptyDayCutoffHour = 18,
    minHour = 0,
  } = options

  if (currentTime.getHours() < minHour) {
    return true
  }

  const dayStart = startOfDay(currentTime).getTime()
  const dayEnd = endOfDay(currentTime).getTime()
  const nowMs = currentTime.getTime()
  const graceMs = graceMinutes !== undefined ? graceMinutes * 60 * 1000 : graceSeconds * 1000

  // Filter for timed events overlapping with today
  const todayTimedEvents = events.filter((evt) => {
    if (ignoreAllDay && evt.isAllDay) return false
    const startMs = new Date(evt.start).getTime()
    const endMs = new Date(evt.end).getTime()
    return endMs > dayStart && startMs < dayEnd
  })

  // If there are no timed events scheduled for today:
  if (todayTimedEvents.length === 0) {
    if (dimZeroEventDays) {
      return false
    }
    return currentTime.getHours() < emptyDayCutoffHour
  }

  // Check if any event has not yet ended (+ grace period)
  return todayTimedEvents.some((evt) => {
    const endMs = new Date(evt.end).getTime()
    return endMs + graceMs > nowMs
  })
}

/**
 * Determines whether an active hover tooltip for an event should be dismissed.
 * If the event was not already past when first hovered, it will be automatically
 * dismissed as soon as the event passes (current time reaches or exceeds event end,
 * or the latest positioned event in the swimlane is marked past).
 * If the user explicitly hovered an already completed/past event, it remains visible.
 */
export function shouldDismissHoveredEvent(
  hoveredEvent: PositionedEvent,
  currentTime: Date,
  latestEvent?: PositionedEvent
): boolean {
  // If the event was already past when first hovered, user explicitly hovered a completed event; keep it visible
  if (hoveredEvent.isPast) {
    return false
  }

  // If the event has ended by clock time
  const eventEndMs = new Date(hoveredEvent.end).getTime()
  if (currentTime.getTime() >= eventEndMs) {
    return true
  }

  // If the updated positioned event in the swimlane is now marked as past
  if (latestEvent?.isPast) {
    return true
  }

  return false
}
