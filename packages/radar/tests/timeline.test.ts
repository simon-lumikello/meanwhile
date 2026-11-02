import { describe, expect, it } from 'bun:test'
import { calculateRadarTimelineTicks } from '../src/core'

/** Five-minute scans from local midnight of 2026-09-17, `minutes` long. */
function scans(minutes: number, from = new Date(2026, 8, 17)): string[] {
  const timestamps: string[] = []
  for (let m = 0; m <= minutes; m += 5) timestamps.push(new Date(from.getTime() + m * 60_000).toISOString())
  return timestamps
}
const labels = (timestamps: string[], nowIndex?: number) =>
  calculateRadarTimelineTicks(timestamps, nowIndex).filter(tick => tick.label !== undefined).map(tick => tick.label)

describe('radar timeline ticks', () => {
  it('generates well-spaced, non-overlapping labels in the afternoon (15:00)', () => {
    const ticks = calculateRadarTimelineTicks(scans(15 * 60)).filter(tick => tick.label)
    expect(ticks.map(tick => tick.label)).toEqual(['00:00', '06:00', '12:00', 'Now'])
    for (let i = 1; i < ticks.length; i++) expect(ticks[i].pct - ticks[i - 1].pct).toBeGreaterThanOrEqual(15)
  })

  it('prevents cramming later in the day (22:00)', () => {
    expect(labels(scans(22 * 60))).toEqual(['00:00', '06:00', '12:00', '18:00', 'Now'])
  })

  it('adapts the step for morning hours (08:00)', () => {
    expect(labels(scans(8 * 60))).toEqual(['00:00', '03:00', '06:00', 'Now'])
  })

  it('handles empty timelines and a single scan', () => {
    expect(calculateRadarTimelineTicks([])).toEqual([])
    expect(labels(scans(0))).toEqual(['Now'])
  })

  it('suppresses labels too close to the start or to Now', () => {
    expect(labels(scans(375))).toEqual(['00:00', '03:00', 'Now'])
  })

  it('places Now before a forecast and labels clock times past midnight', () => {
    // 21:00–23:00 of scans, then a three-hour forecast into the next day.
    const timestamps = scans(5 * 60, new Date(2026, 8, 17, 21))
    const nowIndex = 24
    const ticks = calculateRadarTimelineTicks(timestamps, nowIndex)
    const now = ticks.find(tick => tick.label === 'Now')!
    expect(now.pct).toBeCloseTo(40)
    expect(labels(timestamps, nowIndex)).toEqual(['21:00', '22:00', 'Now', '00:00'])
    expect(ticks.map(tick => tick.pct)).toEqual([...ticks.map(tick => tick.pct)].sort((a, b) => a - b))
  })
})
