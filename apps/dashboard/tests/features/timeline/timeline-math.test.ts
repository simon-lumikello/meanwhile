import { describe, expect, it } from 'bun:test'
import type { CalendarEvent } from '@dashboard/features/timeline'
import {
  assignEventTracks,
  calculateEventPosition,
  getPlayheadPercent,
  hasRemainingEventsToday,
  shouldDismissHoveredEvent,
} from '@dashboard/features/timeline'

describe('Timeline Math & Coordinate Engine', () => {
  const testDate = new Date(2026, 8, 5) // Sep 5, 2026

  it('calculates playhead percent accurately for 24h day', () => {
    // 00:00:00 -> 0%
    const midnight = new Date(2026, 8, 5, 0, 0, 0)
    expect(getPlayheadPercent(midnight, testDate)).toBe(0)

    // 12:00:00 -> 50%
    const noon = new Date(2026, 8, 5, 12, 0, 0)
    expect(getPlayheadPercent(noon, testDate)).toBe(50)

    // 18:00:00 -> 75%
    const evening = new Date(2026, 8, 5, 18, 0, 0)
    expect(getPlayheadPercent(evening, testDate)).toBe(75)

    // Returns null if target date is not the current time date
    const tomorrow = new Date(2026, 8, 6, 12, 0, 0)
    expect(getPlayheadPercent(noon, tomorrow)).toBeNull()
  })

  it('calculates event position inside current day bounds', () => {
    const event: CalendarEvent = {
      id: 'event-1',
      swimlaneId: 'lane-1',
      title: 'Lunch Meeting',
      start: new Date(2026, 8, 5, 12, 0, 0), // 12:00
      end: new Date(2026, 8, 5, 13, 30, 0),   // 13:30 (90 min)
      isAllDay: false,
    }

    // Playhead is at 10:00 (41.67%) -> event is completely in the future
    const playheadAt10 = (10 * 60) / 1440 * 100
    const pos = calculateEventPosition(event, testDate, playheadAt10)

    expect(pos).not.toBeNull()
    expect(pos!.startPercent).toBe(50) // 12:00 = 50%
    expect(pos!.endPercent).toBeCloseTo(56.25, 2) // 13:30 = 56.25%
    expect(pos!.isFuture).toBe(true)
    expect(pos!.isPast).toBe(false)
    expect(pos!.isInProgress).toBe(false)
  })

  it('calculates split-progress muting for currently active events', () => {
    // Event from 10:00 to 12:00 (120 minutes)
    const event: CalendarEvent = {
      id: 'event-active',
      swimlaneId: 'lane-1',
      title: 'Deep Work Session',
      start: new Date(2026, 8, 5, 10, 0, 0),
      end: new Date(2026, 8, 5, 12, 0, 0),
      isAllDay: false,
    }

    // Playhead at 11:30 (90 minutes into a 120-minute event -> 75% elapsed)
    const playheadAt1130 = (11 * 60 + 30) / 1440 * 100
    const pos = calculateEventPosition(event, testDate, playheadAt1130)

    expect(pos).not.toBeNull()
    expect(pos!.isInProgress).toBe(true)
    expect(pos!.isPast).toBe(false)
    expect(pos!.isFuture).toBe(false)
    expect(pos!.progressFraction).toBeCloseTo(0.75, 2)
    expect(pos!.splitOffsetPercent).toBeCloseTo(75, 1)
  })

  it('clamps multi-day or overnight events to today visible window', () => {
    // Event starting yesterday at 22:00 and ending today at 04:00
    const overnightEvent: CalendarEvent = {
      id: 'event-overnight',
      swimlaneId: 'lane-1',
      title: 'Night Shift',
      start: new Date(2026, 8, 4, 22, 0, 0),
      end: new Date(2026, 8, 5, 4, 0, 0),
      isAllDay: false,
    }

    // Today is Sep 5
    const pos = calculateEventPosition(overnightEvent, testDate, 50)

    expect(pos).not.toBeNull()
    // Should be clamped to start at 00:00 (0%) on today's timeline
    expect(pos!.startPercent).toBe(0)
    // 04:00 should map to 4/24 = 16.67%
    expect(pos!.endPercent).toBeCloseTo(16.67, 1)
    expect(pos!.isPast).toBe(true)
  })

  it('discards events occurring wholly on other days', () => {
    const yesterdayEvent: CalendarEvent = {
      id: 'event-yesterday',
      swimlaneId: 'lane-1',
      title: 'Yesterday Task',
      start: new Date(2026, 8, 4, 10, 0, 0),
      end: new Date(2026, 8, 4, 11, 0, 0),
      isAllDay: false,
    }

    expect(calculateEventPosition(yesterdayEvent, testDate, 50)).toBeNull()
  })

  it('assigns separate tracks for overlapping events in the same swimlane', () => {
    // 3 overlapping events: 14:00-16:00, 14:30-17:00, 15:00-16:30
    const ev1: CalendarEvent = {
      id: 'ev-1',
      swimlaneId: 'family',
      title: 'Event 1',
      start: new Date(2026, 8, 5, 14, 0),
      end: new Date(2026, 8, 5, 16, 0),
      isAllDay: false,
    }
    const ev2: CalendarEvent = {
      id: 'ev-2',
      swimlaneId: 'family',
      title: 'Event 2',
      start: new Date(2026, 8, 5, 14, 30),
      end: new Date(2026, 8, 5, 17, 0),
      isAllDay: false,
    }

    const pos1 = calculateEventPosition(ev1, testDate, null)!
    const pos2 = calculateEventPosition(ev2, testDate, null)!

    const tracked = assignEventTracks([pos1, pos2])
    expect(tracked.length).toBe(2)
    // They should have totalTracks = 2 and different trackIndex (0 and 1)
    expect(tracked[0].totalTracks).toBe(2)
    expect(tracked[1].totalTracks).toBe(2)
    expect(tracked[0].trackIndex).not.toBe(tracked[1].trackIndex)
  })

  it('assigns up to 4 concurrent overlapping events to separate sub-tracks without collision', () => {
    // 4 concurrent events spanning 14:00-15:00
    const events: CalendarEvent[] = [1, 2, 3, 4].map((i) => ({
      id: `ev-${i}`,
      swimlaneId: 'family',
      title: `Person ${i} Task`,
      start: new Date(2026, 8, 5, 14, 0),
      end: new Date(2026, 8, 5, 15, 0),
      isAllDay: false,
    }))

    const positioned = events.map((e) => calculateEventPosition(e, testDate, null)!)
    const tracked = assignEventTracks(positioned)

    expect(tracked).toHaveLength(4)
    expect(tracked[0].totalTracks).toBe(4)

    // All 4 track indices must be unique [0, 1, 2, 3]
    const indices = tracked.map((t) => t.trackIndex).sort()
    expect(indices).toEqual([0, 1, 2, 3])
  })

  it('positions events ending at midnight with exact 100% endPercent', () => {
    const eveningEvent: CalendarEvent = {
      id: 'ev-midnight',
      swimlaneId: 'lane-1',
      title: 'Late Movie',
      start: new Date(2026, 8, 5, 21, 0, 0),
      end: new Date(2026, 8, 6, 0, 0, 0), // Ending at midnight of next day
      isAllDay: false,
    }

    const pos = calculateEventPosition(eveningEvent, testDate, null)
    expect(pos).not.toBeNull()
    expect(pos!.startPercent).toBeCloseTo(87.5, 1) // 21:00 = 21/24 = 87.5%
    expect(pos!.endPercent).toBe(100) // Exactly 100% at midnight!
  })

  describe('hasRemainingEventsToday', () => {
    const today = new Date(2026, 8, 5, 14, 0, 0) // Sep 5, 2026, 14:00 (2 PM)

    it('returns true when an event is currently ongoing', () => {
      const ongoingEvent: CalendarEvent = {
        id: 'ev-ongoing',
        swimlaneId: 'lane-1',
        title: 'Meeting',
        start: new Date(2026, 8, 5, 13, 30, 0),
        end: new Date(2026, 8, 5, 15, 0, 0),
        isAllDay: false,
      }
      expect(hasRemainingEventsToday([ongoingEvent], today)).toBe(true)
    })

    it('returns true when an upcoming event is scheduled later today', () => {
      const futureEvent: CalendarEvent = {
        id: 'ev-future',
        swimlaneId: 'lane-1',
        title: 'Dinner',
        start: new Date(2026, 8, 5, 18, 0, 0),
        end: new Date(2026, 8, 5, 19, 30, 0),
        isAllDay: false,
      }
      expect(hasRemainingEventsToday([futureEvent], today)).toBe(true)
    })

    it('returns true within the default 30-second grace period after an event ends', () => {
      // Current time: 14:00:00. Event ended at 13:59:45 (15 seconds ago).
      const recentEvent: CalendarEvent = {
        id: 'ev-recent',
        swimlaneId: 'lane-1',
        title: 'Quick Standup',
        start: new Date(2026, 8, 5, 13, 30, 0),
        end: new Date(2026, 8, 5, 13, 59, 45),
        isAllDay: false,
      }
      expect(hasRemainingEventsToday([recentEvent], today)).toBe(true)
    })

    it('returns false when all events for today ended past the 30-second grace period', () => {
      // Current time: 14:00:00. Event ended at 13:59:15 (45 seconds ago).
      const pastEvent: CalendarEvent = {
        id: 'ev-past',
        swimlaneId: 'lane-1',
        title: 'Lunch',
        start: new Date(2026, 8, 5, 13, 0, 0),
        end: new Date(2026, 8, 5, 13, 59, 15),
        isAllDay: false,
      }
      expect(hasRemainingEventsToday([pastEvent], today)).toBe(false)
    })

    it('ignores all-day events by default so they do not keep the screen awake', () => {
      const allDayEvent: CalendarEvent = {
        id: 'ev-allday',
        swimlaneId: 'lane-1',
        title: 'National Holiday',
        start: new Date(2026, 8, 5, 0, 0, 0),
        end: new Date(2026, 8, 5, 23, 59, 59),
        isAllDay: true,
      }
      const morningEvent: CalendarEvent = {
        id: 'ev-past',
        swimlaneId: 'lane-1',
        title: 'Morning Yoga',
        start: new Date(2026, 8, 5, 11, 0, 0),
        end: new Date(2026, 8, 5, 12, 0, 0),
        isAllDay: false,
      }
      // At 14:00, morning event is finished. All-day event is ignored -> returns false
      expect(hasRemainingEventsToday([allDayEvent, morningEvent], today)).toBe(false)
    })

    it('dims on days with zero scheduled events by default', () => {
      // Zero event days dim regardless of time of day
      const morning = new Date(2026, 8, 5, 9, 0, 0)
      expect(hasRemainingEventsToday([], morning)).toBe(false)

      const afternoon = new Date(2026, 8, 5, 14, 0, 0)
      expect(hasRemainingEventsToday([], afternoon)).toBe(false)
    })

    it('promptly returns true when a new upcoming or ongoing event is added', () => {
      // Day originally had no remaining events
      expect(hasRemainingEventsToday([], today)).toBe(false)

      // Poller pulls a newly added event for later today
      const newEvent: CalendarEvent = {
        id: 'ev-new',
        swimlaneId: 'lane-1',
        title: 'Doctor Appointment',
        start: new Date(2026, 8, 5, 15, 0, 0),
        end: new Date(2026, 8, 5, 16, 0, 0),
        isAllDay: false,
      }
      expect(hasRemainingEventsToday([newEvent], today)).toBe(true)
    })
  })

  describe('shouldDismissHoveredEvent', () => {
    const ongoingEvent = {
      id: 'ev-1',
      swimlaneId: 'lane-1',
      title: 'Week Prep & Meal Planning',
      start: new Date(2026, 8, 5, 16, 0, 0),
      end: new Date(2026, 8, 5, 17, 30, 0),
      isAllDay: false,
      startPercent: (16 / 24) * 100,
      endPercent: (17.5 / 24) * 100,
      widthPercent: (1.5 / 24) * 100,
      isPast: false,
      isFuture: false,
      isInProgress: true,
      progressFraction: 0.5,
      splitOffsetPercent: 50,
    }

    it('keeps tooltip open while the event is ongoing', () => {
      // Current time is 17:00 (event ends at 17:30)
      const currentTime = new Date(2026, 8, 5, 17, 0, 0)
      expect(shouldDismissHoveredEvent(ongoingEvent, currentTime)).toBe(false)
    })

    it('force hides the tooltip once the event passes', () => {
      // Current time reaches 17:30:00 (event has passed)
      const passedTime = new Date(2026, 8, 5, 17, 30, 0)
      expect(shouldDismissHoveredEvent(ongoingEvent, passedTime)).toBe(true)

      // Current time is 17:30:01
      const laterTime = new Date(2026, 8, 5, 17, 30, 1)
      expect(shouldDismissHoveredEvent(ongoingEvent, laterTime)).toBe(true)
    })

    it('force hides the tooltip if the latest positioned event in the swimlane is marked past', () => {
      const currentTime = new Date(2026, 8, 5, 17, 29, 59)
      const updatedEvent = {
        ...ongoingEvent,
        isPast: true,
        isInProgress: false,
      }
      expect(shouldDismissHoveredEvent(ongoingEvent, currentTime, updatedEvent)).toBe(true)
    })

    it('preserves the tooltip when the user explicitly hovers an already completed event', () => {
      const pastEvent = {
        ...ongoingEvent,
        isPast: true,
        isInProgress: false,
      }
      // Hovering a past event at 18:00
      const currentTime = new Date(2026, 8, 5, 18, 0, 0)
      expect(shouldDismissHoveredEvent(pastEvent, currentTime)).toBe(false)
    })
  })
})
