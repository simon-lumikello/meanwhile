import { describe, expect, it } from 'bun:test'
import {
  isNightHour,
  calculateAmbientState,
  shouldMountDimmer,
  shouldHideTimelineRadar,
  shouldListenForWake,
  shouldHandleWake,
} from '@dashboard/components/ambient/ambientPolicy'
import {
  calculateAmbientBackground as calculateLockScreenBackground,
  shouldPresentRadarInWeatherRow,
  shouldHideStackedRadarCard,
  shouldUseCompactClock,
} from '@simon-lumikello/meanwhile-ambient/core'

describe('Ambient Dimmer & Decoupled Night Mode Logic', () => {
  describe('isNightHour', () => {
    it('handles night window spanning midnight (e.g. 21:00 to 07:00)', () => {
      // Night hours
      expect(isNightHour(21, 21, 7)).toBe(true)
      expect(isNightHour(22, 21, 7)).toBe(true)
      expect(isNightHour(23, 21, 7)).toBe(true)
      expect(isNightHour(0, 21, 7)).toBe(true)
      expect(isNightHour(3, 21, 7)).toBe(true)
      expect(isNightHour(6, 21, 7)).toBe(true)

      // Day hours
      expect(isNightHour(7, 21, 7)).toBe(false)
      expect(isNightHour(8, 21, 7)).toBe(false)
      expect(isNightHour(12, 21, 7)).toBe(false)
      expect(isNightHour(18, 21, 7)).toBe(false)
      expect(isNightHour(20, 21, 7)).toBe(false)
    })

    it('handles night window on the same calendar day (e.g. 01:00 to 05:00)', () => {
      expect(isNightHour(0, 1, 5)).toBe(false)
      expect(isNightHour(1, 1, 5)).toBe(true)
      expect(isNightHour(3, 1, 5)).toBe(true)
      expect(isNightHour(4, 1, 5)).toBe(true)
      expect(isNightHour(5, 1, 5)).toBe(false)
      expect(isNightHour(14, 1, 5)).toBe(false)
    })
  })

  describe('calculateAmbientState', () => {
    const defaultParams = {
      enabled: true,
      startHour: 21,
      endHour: 7,
      currentTime: new Date(2026, 8, 12, 14, 0, 0), // 14:00 (Daytime)
      dimAfterLastEvent: true,
      hasRemainingEvents: true,
      isTemporarilyAwake: false,
    }

    it('returns shouldShow: false, isDimmed: false, and isEligibleToShow: false when disabled', () => {
      const state = calculateAmbientState({
        ...defaultParams,
        enabled: false,
        hasRemainingEvents: false,
      })
      expect(state.shouldShow).toBe(false)
      expect(state.isDimmed).toBe(false)
      expect(state.isEligibleToShow).toBe(false)
    })

    it('during daytime with pending events: shows normal timeline (no ambient, not dimmed, not eligible)', () => {
      const state = calculateAmbientState({
        ...defaultParams,
        currentTime: new Date(2026, 8, 12, 14, 0, 0),
        hasRemainingEvents: true,
      })
      expect(state.shouldShow).toBe(false)
      expect(state.isDimmed).toBe(false)
      expect(state.isNightTime).toBe(false)
      expect(state.isNoRemainingEvents).toBe(false)
      expect(state.isEligibleToShow).toBe(false)
    })

    it('in the morning after overnight idle (07:30): is not eligible and shouldShow is false', () => {
      const state = calculateAmbientState({
        ...defaultParams,
        currentTime: new Date(2026, 8, 13, 7, 30, 0),
        hasRemainingEvents: true,
      })
      expect(state.shouldShow).toBe(false)
      expect(state.isDimmed).toBe(false)
      expect(state.isNightTime).toBe(false)
      expect(state.isEligibleToShow).toBe(false)
    })

    it('during daytime with NO remaining events: displays weather cards UNDIMMED (full brightness)', () => {
      const state = calculateAmbientState({
        ...defaultParams,
        currentTime: new Date(2026, 8, 12, 14, 0, 0),
        hasRemainingEvents: false,
        dimAfterLastEvent: true,
      })
      expect(state.shouldShow).toBe(true)
      expect(state.isDimmed).toBe(false) // Decoupled! Not dimmed during daytime
      expect(state.isNightTime).toBe(false)
      expect(state.isNoRemainingEvents).toBe(true)
      expect(state.isEligibleToShow).toBe(true)
    })

    it('during daytime with NO remaining events when dimAfterLastEvent is disabled: stays on timeline', () => {
      const state = calculateAmbientState({
        ...defaultParams,
        currentTime: new Date(2026, 8, 12, 14, 0, 0),
        hasRemainingEvents: false,
        dimAfterLastEvent: false,
      })
      expect(state.shouldShow).toBe(false)
      expect(state.isDimmed).toBe(false)
      expect(state.isEligibleToShow).toBe(false)
    })

    it('during night hours: displays ambient screen AND applies dimming', () => {
      const state = calculateAmbientState({
        ...defaultParams,
        currentTime: new Date(2026, 8, 12, 22, 30, 0), // 22:30 Night
        hasRemainingEvents: true,
      })
      expect(state.shouldShow).toBe(true)
      expect(state.isDimmed).toBe(true)
      expect(state.isNightTime).toBe(true)
      expect(state.isEligibleToShow).toBe(true)
    })

    it('during night hours past midnight (03:00): displays ambient screen AND applies dimming', () => {
      const state = calculateAmbientState({
        ...defaultParams,
        currentTime: new Date(2026, 8, 13, 3, 0, 0), // 03:00 Night
        hasRemainingEvents: false,
      })
      expect(state.shouldShow).toBe(true)
      expect(state.isDimmed).toBe(true)
      expect(state.isNightTime).toBe(true)
      expect(state.isEligibleToShow).toBe(true)
    })

    it('when temporarily awake during night: hides ambient overlay so timeline is visible, but stays eligible', () => {
      const state = calculateAmbientState({
        ...defaultParams,
        currentTime: new Date(2026, 8, 12, 22, 30, 0),
        hasRemainingEvents: false,
        isTemporarilyAwake: true,
      })
      expect(state.shouldShow).toBe(false)
      expect(state.isDimmed).toBe(false)
      expect(state.isNightTime).toBe(true)
      expect(state.isEligibleToShow).toBe(true) // Still eligible so inactivity timeout returns to ambient
    })

    it('when temporarily awake during daytime (no events): hides ambient overlay', () => {
      const state = calculateAmbientState({
        ...defaultParams,
        currentTime: new Date(2026, 8, 12, 15, 0, 0),
        hasRemainingEvents: false,
        isTemporarilyAwake: true,
      })
      expect(state.shouldShow).toBe(false)
      expect(state.isDimmed).toBe(false)
      expect(state.isEligibleToShow).toBe(true)
    })
  })

  describe('shouldListenForWake & shouldHandleWake (Morning Wake-up & Anti-Glitch Guards)', () => {
    it('registers wake listeners ONLY when ambient screen is eligible and currently shown', () => {
      // Active lock screen at night: listeners MUST be attached
      expect(shouldListenForWake(true, true)).toBe(true)

      // Lock screen was woken up and user is browsing timeline: wake listeners removed
      expect(shouldListenForWake(true, false)).toBe(false)

      // Daytime timeline with events: wake listeners MUST NOT be attached
      expect(shouldListenForWake(false, false)).toBe(false)

      // Daytime morning after overnight idle: wake listeners MUST NOT be attached
      expect(shouldListenForWake(false, true)).toBe(false)
    })

    it('allows wake trigger ONLY when eligible, lock screen is shown, and not already waking', () => {
      // Normal valid wake: user touches active lock screen at night
      expect(shouldHandleWake(true, true, false)).toBe(true)

      // Spurious wake during morning when dashboard is already on timeline (user bug scenario)
      // Lock screen is NOT eligible and NOT shown
      expect(shouldHandleWake(false, false, false)).toBe(false)

      // Spurious wake during daytime when moving mouse on timeline
      expect(shouldHandleWake(false, false, false)).toBe(false)

      // Lock screen is already in the middle of waking / playing exit transition
      expect(shouldHandleWake(true, true, true)).toBe(false)

      // Lock screen is not shown (e.g. while temporarily awake)
      expect(shouldHandleWake(true, false, false)).toBe(false)
    })

    it('prevents lock screen flashing when user moves mouse in the morning after overnight idle', () => {
      // Scenario: Dashboard was idle overnight at 03:00.
      // At 03:00, night mode is active.
      const nightState = calculateAmbientState({
        enabled: true,
        startHour: 21,
        endHour: 7,
        currentTime: new Date(2026, 8, 13, 3, 0, 0),
        hasRemainingEvents: true,
        isTemporarilyAwake: false,
      })
      expect(nightState.isEligibleToShow).toBe(true)
      expect(nightState.shouldShow).toBe(true)
      const lockScreenShownAtNight = shouldMountDimmer(nightState.shouldShow, true, false)
      expect(lockScreenShownAtNight).toBe(true)
      expect(shouldListenForWake(nightState.isEligibleToShow, lockScreenShownAtNight)).toBe(true)

      // Morning arrives at 07:00 (endHour=7). Dashboard rolls over.
      // Timeline becomes active.
      const morningState = calculateAmbientState({
        enabled: true,
        startHour: 21,
        endHour: 7,
        currentTime: new Date(2026, 8, 13, 7, 15, 0),
        hasRemainingEvents: true, // Today has calendar events
        isTemporarilyAwake: false, // Nobody touched it yet
      })
      expect(morningState.isNightTime).toBe(false)
      expect(morningState.isEligibleToShow).toBe(false)
      expect(morningState.shouldShow).toBe(false)

      const isMountedInMorning = shouldMountDimmer(morningState.shouldShow, true, false)
      expect(isMountedInMorning).toBe(false)

      // The wake listener MUST NOT be attached in the morning
      const canWakeInMorning = shouldListenForWake(morningState.isEligibleToShow, isMountedInMorning)
      expect(canWakeInMorning).toBe(false)

      // When the user approaches the kiosk at 07:30 and moves the mouse:
      // Even if mouse event fires, shouldHandleWake MUST reject it
      const canHandleWakeInMorning = shouldHandleWake(
        morningState.isEligibleToShow,
        isMountedInMorning,
        false
      )
      expect(canHandleWakeInMorning).toBe(false)

      // isExiting remains false, so shouldMountDimmer stays strictly false
      const isMountedAfterMouseMove = shouldMountDimmer(morningState.shouldShow, true, false)
      expect(isMountedAfterMouseMove).toBe(false)
      // Visual glitch completely eliminated!
    })
  })

  describe('shouldMountDimmer (Fade-in Gating & Exit Lifecycle)', () => {
    it('returns false when ambient dimmer is not eligible to show', () => {
      expect(shouldMountDimmer(false, false, false)).toBe(false)
      expect(shouldMountDimmer(false, true, false)).toBe(false)
    })

    it('returns false when ambient dimmer wants to show but weather cards are not ready yet', () => {
      // Prevents premature abrupt pop-in of empty/loading cards
      expect(shouldMountDimmer(true, false, false)).toBe(false)
    })

    it('returns true to fade in when ambient dimmer is active AND cards are ready', () => {
      expect(shouldMountDimmer(true, true, false)).toBe(true)
    })

    it('returns true while wake exit animation is playing, even if shouldShow flipped to false', () => {
      // Ensures the DOM element stays mounted to complete the 300ms dissolve animation
      expect(shouldMountDimmer(false, false, true)).toBe(true)
      expect(shouldMountDimmer(false, true, true)).toBe(true)
    })

    it('returns false once exit animation completes and component is temporarily awake', () => {
      expect(shouldMountDimmer(false, true, false)).toBe(false)
    })
  })

  describe('shouldHideTimelineRadar (Mutual Exclusion with Lock Screen Radar)', () => {
    it('hides timeline radar when lock screen is shown AND contains weather radar', () => {
      // User scenario: lock screen is active with AmbientRadarCard visible
      const isLockScreenShown = true
      const hasLockScreenRadar = true
      expect(shouldHideTimelineRadar(isLockScreenShown, hasLockScreenRadar)).toBe(true)
    })

    it('keeps timeline radar visible when lock screen is shown BUT does not contain weather radar', () => {
      // User turned off radar card in night mode settings, or radar is unsupported
      const isLockScreenShown = true
      const hasLockScreenRadar = false
      expect(shouldHideTimelineRadar(isLockScreenShown, hasLockScreenRadar)).toBe(false)
    })

    it('keeps timeline radar visible when lock screen is NOT shown even if radar card is enabled in settings', () => {
      // Daytime timeline with radar active
      const isLockScreenShown = false
      const hasLockScreenRadar = true
      expect(shouldHideTimelineRadar(isLockScreenShown, hasLockScreenRadar)).toBe(false)
    })

    it('keeps timeline radar visible when lock screen is temporarily awake', () => {
      // User tapped or moved mouse to temporarily wake the screen:
      // isLockScreenShown is false during temporary wake, so timeline radar smoothly restores
      const isLockScreenShown = false
      const hasLockScreenRadar = true
      expect(shouldHideTimelineRadar(isLockScreenShown, hasLockScreenRadar)).toBe(false)
    })
  })

  describe('calculateLockScreenBackground (Strictly Opaque Lock Screen)', () => {
    it('returns solid #090d16 when undimmed during daytime', () => {
      expect(calculateLockScreenBackground(false, 80)).toBe('#090d16')
      expect(calculateLockScreenBackground(false, 95)).toBe('#090d16')
    })

    it('returns 100% opaque darkened RGB when dimmed at night (no rgba or transparency)', () => {
      const bg = calculateLockScreenBackground(true, 80)
      expect(bg).toBe('rgb(2, 3, 4)')
      expect(bg.startsWith('rgb(')).toBe(true)
      expect(bg.includes('rgba')).toBe(false)
    })

    it('blends towards pure black at 100% background dimming', () => {
      expect(calculateLockScreenBackground(true, 100)).toBe('rgb(0, 0, 0)')
    })

    it('respects lower dimming thresholds while maintaining full opacity', () => {
      const bg = calculateLockScreenBackground(true, 40)
      expect(bg).toBe('rgb(5, 8, 13)')
      expect(bg.includes('rgba')).toBe(false)
    })
  })

  describe('shouldPresentRadarInWeatherRow (Adaptive Radar Placement on Wide & Short Screens)', () => {
    it('returns false when radar card is not present or disabled', () => {
      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: false,
          windowWidth: 1920,
          windowHeight: 900,
        })
      ).toBe(false)
    })

    it('returns true on wide and short screens (user screenshot scenario: 1080p desktop with browser chrome)', () => {
      // 1920x1080 screen with browser tabs, address bar, bookmarks bar, and taskbar (~900-940px height)
      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 1920,
          windowHeight: 920,
        })
      ).toBe(true)
    })

    it('returns true on full-screen 1080p display where stacked mode (1180px required) would otherwise clip', () => {
      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 1920,
          windowHeight: 1080,
        })
      ).toBe(true)
    })

    it('returns true on wide laptops with 900p or 768p displays (e.g. 1600x900)', () => {
      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 1600,
          windowHeight: 900,
        })
      ).toBe(true)
    })

    it('returns true on ultrawide short displays (e.g. 2560x1080)', () => {
      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 2560,
          windowHeight: 950,
        })
      ).toBe(true)
    })

    it('returns true on half-screen and short windows (e.g. 1280x800, 2560x1100) where the stacked card would not fit', () => {
      // Below the 1120px stacked minimum the radar joins the row, so no wide window loses it
      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 1280,
          windowHeight: 800,
        })
      ).toBe(true)

      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 2560,
          windowHeight: 1100,
        })
      ).toBe(true)
    })

    it('returns false on tall wall kiosks (e.g. 27" 2560x1440 iMac) where stacked 2-row layout fits comfortably without clipping', () => {
      // Height 1440px is above the 1120px stacked minimum: room for the stacked 2-card wide layout
      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 2560,
          windowHeight: 1440,
        })
      ).toBe(false)
    })

    it('returns false on 4K tall displays (3840x2160)', () => {
      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 3840,
          windowHeight: 2160,
        })
      ).toBe(false)
    })

    it('returns false on narrow screens (< 1200px) to prevent shrinking weather cards', () => {
      // Three cards side by side need at least 1200px
      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 1199,
          windowHeight: 800,
        })
      ).toBe(false)

      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 1024,
          windowHeight: 768,
        })
      ).toBe(false)

      expect(
        shouldPresentRadarInWeatherRow({
          hasRadarCard: true,
          windowWidth: 768,
          windowHeight: 1024,
        })
      ).toBe(false)
    })
  })

  describe('shouldHideStackedRadarCard (hide the bottom radar card instead of clipping it)', () => {
    it('returns false when there is no radar card', () => {
      expect(
        shouldHideStackedRadarCard({
          hasRadarCard: false,
          isRadarInRow: false,
          windowWidth: 1200,
          windowHeight: 700,
        })
      ).toBe(false)
    })

    it('returns false when the radar already fits in-row alongside the weather cards', () => {
      expect(
        shouldHideStackedRadarCard({
          hasRadarCard: true,
          isRadarInRow: true,
          windowWidth: 1920,
          windowHeight: 900,
        })
      ).toBe(false)
    })

    it('hides the stacked radar card on a two-column screen too short to fit it (issue #19 screenshot scenario)', () => {
      expect(
        shouldHideStackedRadarCard({
          hasRadarCard: true,
          isRadarInRow: false,
          windowWidth: 1300,
          windowHeight: 980,
        })
      ).toBe(true)
    })

    it('keeps the stacked radar card on a two-column screen tall enough to fit it', () => {
      expect(
        shouldHideStackedRadarCard({
          hasRadarCard: true,
          isRadarInRow: false,
          windowWidth: 1300,
          windowHeight: 1400,
        })
      ).toBe(false)
    })

    it('requires more height on single-column (mobile) widths, where all three cards stack vertically', () => {
      expect(
        shouldHideStackedRadarCard({
          hasRadarCard: true,
          isRadarInRow: false,
          windowWidth: 700,
          windowHeight: 1350,
        })
      ).toBe(true)

      expect(
        shouldHideStackedRadarCard({
          hasRadarCard: true,
          isRadarInRow: false,
          windowWidth: 700,
          windowHeight: 1600,
        })
      ).toBe(false)
    })
  })

  describe('shouldUseCompactClock (shrink the clock to make room for weather cards on short screens)', () => {
    it('stays full-size on tall two-column screens', () => {
      expect(shouldUseCompactClock({ windowWidth: 1300, windowHeight: 1000 })).toBe(false)
    })

    it('shrinks on short two-column screens where the weather cards alone risk clipping', () => {
      expect(shouldUseCompactClock({ windowWidth: 1300, windowHeight: 700 })).toBe(true)
    })

    it('requires more height on single-column (mobile) widths before shrinking', () => {
      expect(shouldUseCompactClock({ windowWidth: 700, windowHeight: 1000 })).toBe(true)
      expect(shouldUseCompactClock({ windowWidth: 700, windowHeight: 1200 })).toBe(false)
    })
  })

  describe('Dashboard ambient controller contract', () => {
    it('exports the dashboard-owned controller that accepts a rain alert', async () => {
      const { AmbientController } = await import('../src/components/ambient/AmbientController')
      expect(typeof AmbientController).toBe('function')
    })
  })
})



