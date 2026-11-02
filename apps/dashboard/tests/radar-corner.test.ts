import { describe, it, expect } from 'bun:test'
import { addDays } from 'date-fns'
import { calculateEventPosition, getPlayheadPercent } from '@dashboard/features/timeline/timelineMath'
import type { CalendarEvent, PositionedEvent } from '@dashboard/features/timeline/calendar'
import { chooseRadarPlacement, getRadarCornerSpans, getVerticalLaneColumns } from '@dashboard/features/timeline/radarCorner'

const NOW = new Date(2026, 9, 31, 15, 0)
const WIDTH = 2560

function at(day: Date, hours: number): Date {
  const d = new Date(day)
  d.setHours(Math.floor(hours), Math.round((hours % 1) * 60), 0, 0)
  return d
}

function positioned(day: Date, startH: number, endH: number, swimlaneId = 'a'): PositionedEvent {
  const event = {
    id: `${swimlaneId}-${startH}-${endH}`,
    title: 'Event',
    start: at(day, startH),
    end: at(day, endH),
    swimlaneId,
  } as unknown as CalendarEvent
  const pos = calculateEventPosition(event, day, getPlayheadPercent(NOW, day))
  if (!pos) throw new Error('event not on day')
  return pos
}

const calendarLanes = (ids: string[]) => ids.map((id) => ({ id, type: id === 'w' ? 'weather' : 'calendar' }))

function place(events: PositionedEvent[], orientation: 'horizontal' | 'vertical' = 'horizontal', laneIds = ['a', 'b'], windowWidth = WIDTH) {
  const eventsByLane: Record<string, PositionedEvent[]> = {}
  for (const e of events) (eventsByLane[e.swimlaneId] ??= []).push(e)
  return chooseRadarPlacement({ eventsByLane, lanes: calendarLanes(laneIds), orientation, radarSize: 'standard', windowWidth, now: NOW })
}

const corner = (...args: Parameters<typeof place>) => place(...args).corner

describe('timeline radar corner', () => {
  const spans = getRadarCornerSpans('standard', WIDTH)
  // Hours covered by each corner on a 2560px display
  const leftHour = ((spans.left.start + spans.left.end) / 2 / 100) * 24
  const rightHour = ((spans.right.start + spans.right.end) / 2 / 100) * 24

  it('stays left with no events on today, yesterday and tomorrow', () => {
    expect(corner([])).toBe('left')
  })

  it('stays left when only ended events are under it', () => {
    expect(corner([positioned(NOW, leftHour - 0.5, leftHour + 0.5)])).toBe('left')
    expect(corner([positioned(addDays(NOW, -1), leftHour - 0.5, leftHour + 0.5)])).toBe('left')
  })

  it('moves right when the left corner would cover an upcoming event', () => {
    expect(corner([positioned(addDays(NOW, 1), leftHour - 0.5, leftHour + 0.5)])).toBe('right')
  })

  it('stays left for upcoming events outside the left span', () => {
    expect(corner([positioned(addDays(NOW, 1), rightHour - 0.5, rightHour + 0.5)])).toBe('left')
  })

  it('stays left when both corners would cover upcoming events', () => {
    const tomorrow = addDays(NOW, 1)
    expect(corner([positioned(tomorrow, leftHour - 0.5, leftHour + 0.5), positioned(tomorrow, rightHour - 0.5, rightHour + 0.5)])).toBe('left')
  })

  it('treats an event in progress as not ended', () => {
    // A long event today that started before now and ends after now, overlapping the left span
    expect(corner([positioned(NOW, 0, 16)])).toBe('right')
  })

  it('vertical: moves right only when the left lane columns have upcoming events', () => {
    const tomorrow = addDays(NOW, 1)
    const lanes = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(corner([], 'vertical', lanes)).toBe('left')
    expect(corner([positioned(tomorrow, 9, 10, 'a')], 'vertical', lanes)).toBe('right')
    expect(corner([positioned(tomorrow, 9, 10, 'f')], 'vertical', lanes)).toBe('left')
    expect(corner([positioned(NOW, 9, 10, 'a')], 'vertical', lanes)).toBe('left')
  })

  it('vertical: starts the left corner past a leading weather column', () => {
    const lanes = ['w', 'a', 'b', 'c', 'd']
    const [weather] = getVerticalLaneColumns(calendarLanes(lanes), WIDTH)
    const placement = place([], 'vertical', lanes)
    expect(placement.corner).toBe('left')
    expect(placement.leftPx).toBeGreaterThanOrEqual(weather.end)
  })

  it('vertical: never covers the weather lane, even when both corners cover upcoming events', () => {
    const tomorrow = addDays(NOW, 1)
    // On a narrow screen the right corner reaches the weather column; the left one starts past it
    const lanes = ['w', 'a', 'b']
    const events = [positioned(tomorrow, 9, 10, 'a'), positioned(tomorrow, 9, 10, 'b')]
    const placement = place(events, 'vertical', lanes, 1000)
    const [weather] = getVerticalLaneColumns(calendarLanes(lanes), 1000)
    expect(placement.corner).toBe('left')
    expect(placement.leftPx).toBeGreaterThanOrEqual(weather.end)
    // Weather as the last column: the right corner would cover it, so the radar stays left
    expect(corner(events, 'vertical', ['a', 'b', 'w'], 1000)).toBe('left')
  })
})
