/**
 * The frame nearest `index` that `isReady` accepts, earlier ones first at equal distance,
 * or -1 when none is. Playback shows it while the wanted scan is still loading.
 */
export function nearestReadyFrame(index: number, count: number, isReady: (index: number) => boolean): number {
  for (let distance = 0; distance < count; distance++) {
    const before = index - distance
    const after = index + distance
    if (before >= 0 && before < count && isReady(before)) return before
    if (distance > 0 && after >= 0 && after < count && isReady(after)) return after
  }
  return -1
}

/** The moment a fractional playhead shows, in epoch milliseconds, between the timestamps it sits between. */
export function playheadTime(timestamps: readonly string[], playhead: number): number {
  const last = timestamps.length - 1
  if (last < 0) return Date.now()
  const clamped = Math.min(last, Math.max(0, playhead))
  const index = Math.floor(clamped)
  const from = Date.parse(timestamps[index])
  if (index >= last) return from
  return from + (Date.parse(timestamps[index + 1]) - from) * (clamped - index)
}
