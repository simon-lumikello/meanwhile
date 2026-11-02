import { describe, expect, it } from 'bun:test'
import {
  getDateKey,
  isDayRollover,
  shouldAutoAdvanceToToday,
  calculateIdleSecondsRemaining,
  shouldIdleReset,
  formatCountdown,
  isNavigatingToToday,
} from '@dashboard/utils/dateRollover'

describe('Midnight Rollover & Kiosk Idle Timer Engine', () => {
  describe('getDateKey & isDayRollover', () => {
    it('produces distinct keys across calendar day changes', () => {
      const day1 = new Date(2026, 8, 9, 23, 59, 59)
      const day2 = new Date(2026, 8, 10, 0, 0, 0)
      expect(getDateKey(day1)).not.toBe(getDateKey(day2))
    })

    it('detects day rollover when transitioning across midnight', () => {
      const day1 = new Date(2026, 8, 9, 23, 59, 59)
      const day2 = new Date(2026, 8, 10, 0, 0, 0)
      const key1 = getDateKey(day1)
      expect(isDayRollover(key1, day2)).toBe(true)
    })

    it('returns false when checking timestamps on the same day', () => {
      const morning = new Date(2026, 8, 10, 7, 0, 0)
      const afternoon = new Date(2026, 8, 10, 15, 30, 0)
      const key = getDateKey(morning)
      expect(isDayRollover(key, afternoon)).toBe(false)
    })

    it('handles initial empty lastDayKey safely', () => {
      const now = new Date()
      expect(isDayRollover('', now)).toBe(false)
    })
  })

  describe('shouldAutoAdvanceToToday', () => {
    it('advances selectedDate when user was tracking today and midnight arrives', () => {
      const day1 = new Date(2026, 8, 9, 23, 59, 59)
      const day2 = new Date(2026, 8, 10, 0, 0, 0)
      const key1 = getDateKey(day1)
      expect(shouldAutoAdvanceToToday(true, key1, day2)).toBe(true)
    })

    it('does NOT force advance if user was browsing another date at midnight', () => {
      const day1 = new Date(2026, 8, 9, 23, 59, 59)
      const day2 = new Date(2026, 8, 10, 0, 0, 0)
      const key1 = getDateKey(day1)
      // User explicitly navigated away; idle reset handles browsing timeout instead
      expect(shouldAutoAdvanceToToday(false, key1, day2)).toBe(false)
    })

    it('returns false when no rollover has occurred', () => {
      const time1 = new Date(2026, 8, 10, 10, 0, 0)
      const time2 = new Date(2026, 8, 10, 10, 1, 0)
      const key = getDateKey(time1)
      expect(shouldAutoAdvanceToToday(true, key, time2)).toBe(false)
    })
  })

  describe('calculateIdleSecondsRemaining & shouldIdleReset', () => {
    const totalIdle = 120 // 2 minutes

    it('returns totalIdleSeconds when no prior activity recorded', () => {
      expect(calculateIdleSecondsRemaining(0, 1000000, totalIdle)).toBe(120)
    })

    it('calculates remaining seconds accurately', () => {
      const start = 1000000
      const now30s = start + 30 * 1000
      expect(calculateIdleSecondsRemaining(start, now30s, totalIdle)).toBe(90)

      const now119s = start + 119 * 1000
      expect(calculateIdleSecondsRemaining(start, now119s, totalIdle)).toBe(1)
    })

    it('clamps remaining seconds to 0 when elapsed exceeds duration', () => {
      const start = 1000000
      const now150s = start + 150 * 1000
      expect(calculateIdleSecondsRemaining(start, now150s, totalIdle)).toBe(0)
    })

    it('fires shouldIdleReset when duration has elapsed and not tracking today', () => {
      const start = 1000000
      const now120s = start + 120 * 1000
      expect(shouldIdleReset(false, start, now120s, totalIdle)).toBe(true)
    })

    it('does not fire shouldIdleReset if user is already tracking today', () => {
      const start = 1000000
      const now150s = start + 150 * 1000
      expect(shouldIdleReset(true, start, now150s, totalIdle)).toBe(false)
    })

    it('does not fire shouldIdleReset before duration has elapsed', () => {
      const start = 1000000
      const now60s = start + 60 * 1000
      expect(shouldIdleReset(false, start, now60s, totalIdle)).toBe(false)
    })
  })

  describe('formatCountdown', () => {
    it('formats 120 seconds as "2:00"', () => {
      expect(formatCountdown(120)).toBe('2:00')
    })

    it('formats 65 seconds as "1:05"', () => {
      expect(formatCountdown(65)).toBe('1:05')
    })

    it('formats 9 seconds as "0:09"', () => {
      expect(formatCountdown(9)).toBe('0:09')
    })

    it('formats 0 seconds as "0:00"', () => {
      expect(formatCountdown(0)).toBe('0:00')
    })

    it('handles undefined or negative seconds gracefully', () => {
      expect(formatCountdown(undefined)).toBe('0:00')
      expect(formatCountdown(-1)).toBe('0:00')
    })
  })

  describe('isNavigatingToToday', () => {
    it('returns true when navigating to today', () => {
      const today = new Date(2026, 8, 10, 12, 0, 0)
      const sameDayOtherTime = new Date(2026, 8, 10, 18, 0, 0)
      expect(isNavigatingToToday(sameDayOtherTime, today)).toBe(true)
    })

    it('returns false when navigating to another day', () => {
      const today = new Date(2026, 8, 10, 12, 0, 0)
      const tomorrow = new Date(2026, 8, 11, 12, 0, 0)
      expect(isNavigatingToToday(tomorrow, today)).toBe(false)
    })
  })
})
