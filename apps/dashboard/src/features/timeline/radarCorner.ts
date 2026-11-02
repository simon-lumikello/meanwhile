import type { RadarWidgetSize } from '@simon-lumikello/meanwhile-radar/core'
import type { PositionedEvent } from './calendar'

export type RadarCorner = 'left' | 'right'

export interface RadarCornerLane {
  id: string
  type: string
}

export interface RadarCornerParams {
  /** Positioned events per lane for the selected day */
  eventsByLane: Record<string, PositionedEvent[]>
  /** Enabled lanes in display order (rows in the horizontal layout, columns in the vertical one) */
  lanes: RadarCornerLane[]
  orientation: 'horizontal' | 'vertical'
  radarSize: RadarWidgetSize
  windowWidth: number
  now: Date
}

export interface RadarPlacement {
  corner: RadarCorner
  /** Left edge in px for the left corner in the vertical layout; undefined keeps the default offset */
  leftPx?: number
}

const SAFETY_GAP = 20
const EDGE_MARGIN = 12

interface Span {
  start: number
  end: number
}

const overlaps = (a: Span, b: Span) => a.start < b.end && a.end > b.start

function radarWidth(radarSize: RadarWidgetSize, windowWidth: number): number {
  return Math.min(radarSize === 'compact' ? 440 : 640, Math.max(200, windowWidth - 24))
}

/**
 * Horizontal layout: the span of the day (0 to 100 percent) each corner covers.
 * Mirrors the overlay's `left-[60px] md:left-[220px]` / `right-3` classes and the
 * lane header column (`w-12` / `md:w-52`) in front of the timeline track.
 */
export function getRadarCornerSpans(radarSize: RadarWidgetSize, windowWidth: number) {
  const isDesktop = windowWidth >= 768
  const headerWidth = isDesktop ? 208 : 48
  const leftOffset = isDesktop ? 220 : 60
  const trackWidth = Math.max(1, windowWidth - headerWidth)
  const width = radarWidth(radarSize, windowWidth)
  const toPercent = (x: number) => Math.min(100, Math.max(0, ((x - headerWidth) / trackWidth) * 100))

  return {
    left: { start: toPercent(leftOffset - SAFETY_GAP), end: toPercent(leftOffset + width + SAFETY_GAP) },
    right: { start: toPercent(windowWidth - EDGE_MARGIN - width - SAFETY_GAP), end: 100 },
  }
}

/**
 * Vertical layout: each lane column's x span in px. Mirrors TimelineGrid: a `w-14` /
 * `md:w-24` time axis, then `flex-1` lanes, with the weather lane at `flex-[0.45]`
 * clamped to 220 to 280px on desktop.
 */
export function getVerticalLaneColumns(lanes: RadarCornerLane[], windowWidth: number): Span[] {
  const isDesktop = windowWidth >= 768
  const axisWidth = isDesktop ? 96 : 56
  const available = Math.max(0, windowWidth - axisWidth)
  const weatherCount = isDesktop ? lanes.filter((l) => l.type === 'weather').length : 0
  const otherCount = lanes.length - weatherCount
  const unit = available / Math.max(0.0001, weatherCount * 0.45 + otherCount)
  const weatherWidth = Math.min(280, Math.max(220, unit * 0.45))
  const otherWidth = otherCount > 0 ? Math.max(0, available - weatherWidth * weatherCount) / otherCount : 0

  let x = axisWidth
  return lanes.map((lane) => {
    const width = isDesktop && lane.type === 'weather' ? weatherWidth : otherWidth
    const span = { start: x, end: x + width }
    x += width
    return span
  })
}

const hasNotEnded = (event: PositionedEvent, now: Date) => new Date(event.end).getTime() > now.getTime()

function hasUpcomingEvents(lane: RadarCornerLane, eventsByLane: Record<string, PositionedEvent[]>, now: Date, span?: Span) {
  return (eventsByLane[lane.id] ?? []).some(
    (event) => hasNotEnded(event, now) && (!span || overlaps(span, { start: event.startPercent, end: event.endPercent }))
  )
}

/**
 * Picks the timeline radar's corner: always the left one, unless it would cover an
 * event that has not ended yet and the right one would not. Ended events may be covered.
 *
 * Horizontal: a corner covers a span of the day's hours across the bottom lanes.
 * Vertical: a corner covers the lane columns under it for the whole scrollable day.
 * The weather lane is never covered there; when it is the leading column, the left
 * corner starts just past it.
 */
export function chooseRadarPlacement({
  eventsByLane,
  lanes,
  orientation,
  radarSize,
  windowWidth,
  now,
}: RadarCornerParams): RadarPlacement {
  if (orientation === 'horizontal') {
    const spans = getRadarCornerSpans(radarSize, windowWidth)
    const covers = (corner: RadarCorner) => lanes.some((lane) => hasUpcomingEvents(lane, eventsByLane, now, spans[corner]))
    if (!covers('left')) return { corner: 'left' }
    return { corner: covers('right') ? 'left' : 'right' }
  }

  const columns = getVerticalLaneColumns(lanes, windowWidth)
  const width = radarWidth(radarSize, windowWidth)
  const isDesktop = windowWidth >= 768
  const axisWidth = isDesktop ? 96 : 56

  // Start the left corner past any leading weather column
  let leftStart = axisWidth
  for (let i = 0; i < lanes.length && lanes[i].type === 'weather'; i++) leftStart = columns[i].end
  const leftPx = leftStart + EDGE_MARGIN

  const footprints: Record<RadarCorner, Span> = {
    left: { start: leftPx, end: leftPx + width + SAFETY_GAP },
    right: { start: windowWidth - EDGE_MARGIN - width - SAFETY_GAP, end: windowWidth },
  }
  const coveredLanes = (corner: RadarCorner) => lanes.filter((_, i) => overlaps(footprints[corner], columns[i]))
  const coversWeather = (corner: RadarCorner) => coveredLanes(corner).some((l) => l.type === 'weather')
  const coversUpcoming = (corner: RadarCorner) => coveredLanes(corner).some((l) => hasUpcomingEvents(l, eventsByLane, now))
  const isClear = (corner: RadarCorner) => !coversWeather(corner) && !coversUpcoming(corner)

  if (isClear('left')) return { corner: 'left', leftPx }
  if (isClear('right')) return { corner: 'right' }
  // Neither is clear: keep off the weather lane first, then prefer left
  if (!coversWeather('left')) return { corner: 'left', leftPx }
  if (!coversWeather('right')) return { corner: 'right' }
  return { corner: 'left', leftPx }
}
