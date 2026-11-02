import { isSameDay } from 'date-fns'

/**
 * Returns a stable YYYY-MM-DD date key for calendar day comparison in local time.
 */
export function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/**
 * Checks if a calendar day rollover has occurred since the previous day key.
 */
export function isDayRollover(lastDayKey: string, now: Date): boolean {
  if (!lastDayKey) return false
  return getDateKey(now) !== lastDayKey
}

/**
 * Evaluates whether selectedDate should automatically advance to now when day changes.
 * Only advances if the user was actively following "Today".
 */
export function shouldAutoAdvanceToToday(isTrackingToday: boolean, lastDayKey: string, now: Date): boolean {
  return isTrackingToday && isDayRollover(lastDayKey, now)
}

/**
 * Calculates remaining idle seconds before returning to Today when browsing other dates.
 */
export function calculateIdleSecondsRemaining(
  lastActivityMs: number,
  nowMs: number,
  totalIdleSeconds: number
): number {
  if (lastActivityMs <= 0) return totalIdleSeconds
  const elapsedSeconds = Math.floor((nowMs - lastActivityMs) / 1000)
  return Math.max(0, totalIdleSeconds - elapsedSeconds)
}

/**
 * Checks if idle reset should fire to return to Today.
 */
export function shouldIdleReset(
  isTrackingToday: boolean,
  lastActivityMs: number,
  nowMs: number,
  totalIdleSeconds: number
): boolean {
  if (isTrackingToday) return false
  return calculateIdleSecondsRemaining(lastActivityMs, nowMs, totalIdleSeconds) <= 0
}

/**
 * Formats seconds into M:SS countdown string (e.g. 120 -> "2:00", 65 -> "1:05").
 */
export function formatCountdown(secs?: number): string {
  if (secs === undefined || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Determines whether navigating to a target date means tracking today.
 */
export function isNavigatingToToday(targetDate: Date, currentDate: Date): boolean {
  return isSameDay(targetDate, currentDate)
}
