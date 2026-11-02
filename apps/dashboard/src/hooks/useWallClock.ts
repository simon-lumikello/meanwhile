import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getDateKey,
  isDayRollover,
  calculateIdleSecondsRemaining,
  isNavigatingToToday,
} from '@dashboard/utils/dateRollover'

interface UseWallClockOptions {
  idleResetMinutes?: number
  onResetToToday?: () => void
}

export function useWallClock({
  idleResetMinutes = 2,
  onResetToToday,
}: UseWallClockOptions = {}) {
  const totalIdleSeconds = Math.max(10, idleResetMinutes * 60)
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState<number>(totalIdleSeconds)

  const isTrackingTodayRef = useRef<boolean>(true)
  const lastDateKeyRef = useRef<string>('')
  const lastActivityRef = useRef<number>(0)

  // Track user activity across window events
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now()
    }

    window.addEventListener('mousemove', handleActivity, { passive: true })
    window.addEventListener('mousedown', handleActivity, { passive: true })
    window.addEventListener('touchstart', handleActivity, { passive: true })
    window.addEventListener('keydown', handleActivity, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('mousedown', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
      window.removeEventListener('keydown', handleActivity)
    }
  }, [])

  // Explicit user date selection (from header navigation buttons or stepper)
  const handleSelectDate = useCallback(
    (date: Date) => {
      const isTargetToday = isNavigatingToToday(date, new Date())
      isTrackingTodayRef.current = isTargetToday
      lastActivityRef.current = Date.now()
      setSelectedDate(date)
      setIdleSecondsRemaining(totalIdleSeconds)
    },
    [totalIdleSeconds]
  )

  // Wall-clock tick, midnight rollover & idle reset timer
  useEffect(() => {
    if (lastActivityRef.current === 0) {
      lastActivityRef.current = Date.now()
    }

    const checkTimeAndRollover = () => {
      const now = new Date()
      setCurrentTime(now)

      if (!lastDateKeyRef.current) {
        lastDateKeyRef.current = getDateKey(now)
      }

      // Midnight rollover or waking up from overnight sleep
      if (isDayRollover(lastDateKeyRef.current, now)) {
        lastDateKeyRef.current = getDateKey(now)

        if (isTrackingTodayRef.current) {
          setSelectedDate(now)
          setIdleSecondsRemaining(totalIdleSeconds)
          return
        }
      }

      // Kiosk idle countdown when browsing non-today dates
      if (!isTrackingTodayRef.current) {
        const lastAct = lastActivityRef.current || Date.now()
        const remaining = calculateIdleSecondsRemaining(lastAct, now.getTime(), totalIdleSeconds)
        setIdleSecondsRemaining(remaining)

        if (remaining <= 0) {
          isTrackingTodayRef.current = true
          setSelectedDate(now)
          setIdleSecondsRemaining(totalIdleSeconds)
          onResetToToday?.()
        }
      } else {
        setIdleSecondsRemaining(totalIdleSeconds)
      }
    }

    const timer = setInterval(checkTimeAndRollover, 1000)

    const handleWakeSync = () => {
      checkTimeAndRollover()
    }
    document.addEventListener('visibilitychange', handleWakeSync)
    window.addEventListener('focus', handleWakeSync)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleWakeSync)
      window.removeEventListener('focus', handleWakeSync)
    }
  }, [totalIdleSeconds, onResetToToday])

  return {
    currentTime,
    selectedDate,
    idleSecondsRemaining,
    handleSelectDate,
  }
}
