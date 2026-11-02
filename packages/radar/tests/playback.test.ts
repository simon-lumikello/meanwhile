import { describe, expect, test } from 'bun:test'
import { nearestReadyFrame, playheadTime } from '../src/playback'

describe('nearestReadyFrame', () => {
  const readyAt = (...indices: number[]) => (index: number) => indices.includes(index)

  test('shows the wanted frame once it is loaded', () => {
    expect(nearestReadyFrame(5, 10, readyAt(4, 5, 6))).toBe(5)
  })

  test('holds the nearest loaded frame while the wanted scan loads, earlier first', () => {
    expect(nearestReadyFrame(5, 10, readyAt(3, 7))).toBe(3)
    expect(nearestReadyFrame(5, 10, readyAt(2, 6))).toBe(6)
  })

  test('reaches into the forecast when no earlier scan has loaded yet', () => {
    expect(nearestReadyFrame(0, 10, readyAt(8, 9))).toBe(8)
  })

  test('reports when nothing has loaded', () => {
    expect(nearestReadyFrame(5, 10, () => false)).toBe(-1)
    expect(nearestReadyFrame(0, 0, () => true)).toBe(-1)
  })
})

describe('playheadTime', () => {
  const timestamps = ['2026-09-27T15:00:00.000Z', '2026-09-27T15:05:00.000Z', '2026-09-27T15:10:00.000Z']

  test('is the scan time on a frame and interpolates between frames', () => {
    expect(playheadTime(timestamps, 1)).toBe(Date.parse(timestamps[1]))
    expect(playheadTime(timestamps, 1.5)).toBe(Date.parse('2026-09-27T15:07:30.000Z'))
  })

  test('stays within the timeline', () => {
    expect(playheadTime(timestamps, -1)).toBe(Date.parse(timestamps[0]))
    expect(playheadTime(timestamps, 7)).toBe(Date.parse(timestamps[2]))
  })
})
