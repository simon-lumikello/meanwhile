
export interface WeatherPointVisibility {
  isVisible: boolean
  isMuted: boolean
}

/**
 * Finds the nearest weather point at or prior to the playhead time on today's timeline.
 */
export function getNearestPastWeatherPoint<T extends { time: string }>(
  points: (T | { point: T; percent?: number })[],
  currentMinutes: number
): T | null {
  let latestPt: T | null = null
  let maxMinutes = -1

  for (const item of points) {
    const pt = 'point' in item ? (item as { point: T }).point : (item as T)
    const itemPercent = 'percent' in item ? (item as { percent?: number }).percent : undefined
    const ptMinutes =
      itemPercent !== undefined
        ? Math.round((itemPercent / 100) * 1440)
        : (() => {
            const d = new Date(pt.time)
            return d.getHours() * 60 + d.getMinutes()
          })()

    if (ptMinutes <= currentMinutes && ptMinutes > maxMinutes) {
      maxMinutes = ptMinutes
      latestPt = pt
    }
  }

  return latestPt
}

/**
 * Determines whether a weather point is visible and/or muted.
 * Keeps the single nearest hour before the playhead visible and active so users
 * can glance current baseline conditions alongside upcoming hours.
 */
export function getWeatherPointVisibility({
  pointTime,
  percent,
  isToday,
  currentMinutes,
  isNearestPast,
  targetDate,
  mutePastEvents = true,
}: {
  pointTime: string
  percent?: number
  isToday: boolean
  currentMinutes: number
  isNearestPast: boolean
  targetDate?: Date
  mutePastEvents?: boolean
}): WeatherPointVisibility {
  const totalMinutes =
    percent !== undefined
      ? Math.round((percent / 100) * 1440)
      : (() => {
          const dateObj = new Date(pointTime)
          return dateObj.getHours() * 60 + dateObj.getMinutes()
        })()

  const isBeforePlayhead = isToday && totalMinutes <= currentMinutes
  const isPast = isToday
    ? isBeforePlayhead
    : targetDate
    ? targetDate.getTime() < new Date().setHours(0, 0, 0, 0)
    : false

  // Nearest hour prior to/at the playhead is always preserved and active
  if (isNearestPast) {
    return { isVisible: true, isMuted: false }
  }

  // Other past points are hidden if mutePastEvents is enabled
  if (isPast && mutePastEvents) {
    return { isVisible: false, isMuted: false }
  }

  // If not hidden, past points are muted when mutePastEvents is disabled
  return {
    isVisible: true,
    isMuted: isPast && !mutePastEvents,
  }
}

/**
 * Calculates dynamic bar height percentage (15% to 100%) for timeline rain visualization.
 * Scales dynamically against the maximum precipitation expected on the timeline (with a baseline anchor of 1.5mm),
 * ensuring light drizzle (e.g. 0.2mm), moderate rain (e.g. 0.8mm), and heavy downpours (e.g. 2.5mm+)
 * all have distinct, glanceable heights without clipping or flattening.
 */
export function calculatePrecipitationBarHeight(
  precipitationMm: number,
  maxTimelinePrecip?: number
): number {
  if (!precipitationMm || precipitationMm <= 0) return 0
  const maxScale = Math.max(1.5, maxTimelinePrecip ?? precipitationMm)
  const ratio = Math.min(1, Math.max(0, precipitationMm / maxScale))
  return Math.round(15 + ratio * 85)
}

