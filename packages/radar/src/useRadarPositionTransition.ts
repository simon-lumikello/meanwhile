import { useState, useEffect, useRef, useCallback } from 'react'

export interface UseRadarPositionTransitionParams {
  targetPlacement: 'left' | 'right'
  hidden?: boolean
  fadeOutDurationMs?: number
  switchBufferMs?: number
}

export interface RadarPositionTransitionState {
  displayedPosition: 'left' | 'right'
  isFadingOut: boolean
}

/**
 * Determines what action should be taken when radar placement or visibility changes:
 * - 'snap': When hidden (e.g. ambient lock screen is showing), immediately snap position
 *   without animation and reset fade state so radar is never stuck invisible overnight.
 * - 'none': When target matches current position, do nothing and ensure isFadingOut = false.
 * - 'animate': When visible and target changes, run the smooth 2-phase fade transition.
 */
export function computeRadarTransitionAction({
  currentDisplayedPosition,
  targetPlacement,
  hidden,
}: {
  currentDisplayedPosition: 'left' | 'right'
  targetPlacement: 'left' | 'right'
  hidden: boolean
}): 'snap' | 'none' | 'animate' {
  if (hidden) return 'snap'
  if (currentDisplayedPosition === targetPlacement) return 'none'
  return 'animate'
}

/**
 * Manages smooth visual transitions when the timeline radar repositions across the playhead
 * (between the past part of the day and the future part of the day).
 *
 * Resilience features:
 * - When hidden (e.g. ambient lock screen displays radar card), snaps position immediately
 *   without animations, preventing stuck fade states during overnight rollover.
 * - Calling setDisplayedPosition does NOT cancel the subsequent fade-in timer.
 * - Cleans up all pending timers on unmount.
 * - Always restores isFadingOut = false when target matches displayed position.
 */
export function useRadarPositionTransition({
  targetPlacement,
  hidden = false,
  fadeOutDurationMs = 450,
  switchBufferMs = 50,
}: UseRadarPositionTransitionParams): RadarPositionTransitionState {
  const [displayedPosition, setDisplayedPosition] = useState<'left' | 'right'>(targetPlacement)
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false)

  const displayedPositionRef = useRef<'left' | 'right'>(targetPlacement)
  const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (fadeOutTimerRef.current) {
      clearTimeout(fadeOutTimerRef.current)
      fadeOutTimerRef.current = null
    }
    if (fadeInTimerRef.current) {
      clearTimeout(fadeInTimerRef.current)
      fadeInTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const action = computeRadarTransitionAction({
      currentDisplayedPosition: displayedPositionRef.current,
      targetPlacement,
      hidden,
    })

    // 1. When hidden (e.g. lock screen active): immediately snap position without animation
    if (action === 'snap') {
      clearTimers()
      setIsFadingOut(false)
      displayedPositionRef.current = targetPlacement
      setDisplayedPosition(targetPlacement)
      return
    }

    // 2. If target already matches current position: clear any stuck fade-out state
    if (action === 'none') {
      clearTimers()
      setIsFadingOut(false)
      return
    }

    // 3. Position change while visible on screen: run smooth 2-phase fade-out -> reposition -> fade-in
    clearTimers()
    setIsFadingOut(true)

    fadeOutTimerRef.current = setTimeout(() => {
      // Reposition while fully invisible (opacity 0)
      displayedPositionRef.current = targetPlacement
      setDisplayedPosition(targetPlacement)
      fadeOutTimerRef.current = null

      // Phase 2: Allow a frame for DOM relocation at opacity 0, then fade gently in at new position
      fadeInTimerRef.current = setTimeout(() => {
        setIsFadingOut(false)
        fadeInTimerRef.current = null
      }, switchBufferMs)
    }, fadeOutDurationMs)

    return () => {
      clearTimers()
    }
  }, [targetPlacement, hidden, clearTimers, fadeOutDurationMs, switchBufferMs])

  return {
    displayedPosition,
    isFadingOut,
  }
}
