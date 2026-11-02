import { describe, it, expect } from 'bun:test'
import {
  calculateWeekOutlookHeight,
  compactClockHeightSaving,
  shouldCompactClockForStackedRadar,
  shouldHideStackedRadarCard,
  shouldPresentRadarInWeatherRow,
  shouldUseCompactClock,
} from '../src/core'

function radarLayout(windowWidth: number, windowHeight: number): 'row' | 'stacked' | 'hidden' {
  const isRadarInRow = shouldPresentRadarInWeatherRow({ hasRadarCard: true, windowWidth, windowHeight })
  if (isRadarInRow) return 'row'
  return shouldHideStackedRadarCard({ hasRadarCard: true, isRadarInRow, windowWidth, windowHeight }) ? 'hidden' : 'stacked'
}

describe('ambient radar layout', () => {
  it('stacks a wide radar card below the weather cards on tall wall displays', () => {
    expect(radarLayout(2560, 1440)).toBe('stacked')
    expect(radarLayout(3840, 2160)).toBe('stacked')
  })

  it('stacks the radar in maximized and half-screen 1440p browser windows', () => {
    // 2560x1440 screen minus browser chrome and taskbar leaves roughly 1265px.
    expect(radarLayout(2560, 1265)).toBe('stacked')
    expect(radarLayout(1280, 1265)).toBe('stacked')
  })

  it('moves the radar into the weather row on wide screens too short to stack it', () => {
    expect(radarLayout(1920, 1200)).toBe('stacked')
    expect(radarLayout(1920, 1080)).toBe('row')
    expect(radarLayout(1920, 950)).toBe('row')
    expect(radarLayout(1600, 900)).toBe('row')
  })

  it('never hides the radar on a window at least 1200px wide', () => {
    for (let windowWidth = 1200; windowWidth <= 3840; windowWidth += 40) {
      for (let windowHeight = 600; windowHeight <= 2200; windowHeight += 10) {
        expect(radarLayout(windowWidth, windowHeight)).not.toBe('hidden')
      }
    }
  })

  it('still hides the stacked radar on narrow, short windows where it would clip', () => {
    expect(radarLayout(1024, 900)).toBe('hidden')
    expect(radarLayout(700, 1350)).toBe('hidden')
  })

  it('makes room for the week outlook without ever dropping the radar on a wide window', () => {
    const extraHeight = calculateWeekOutlookHeight({ isWeekShown: true, hasWeekToggle: true })
    const layout = (windowWidth: number, windowHeight: number) => {
      const isRadarInRow = shouldPresentRadarInWeatherRow({ hasRadarCard: true, windowWidth, windowHeight, extraHeight })
      if (isRadarInRow) return 'row'
      return shouldHideStackedRadarCard({ hasRadarCard: true, isRadarInRow, windowWidth, windowHeight, extraHeight, canCompactClock: true }) ? 'hidden' : 'stacked'
    }

    expect(layout(2560, 1440)).toBe('stacked')
    // Common wall and desktop sizes keep the larger stacked radar; the clock shrinks instead.
    expect(layout(1920, 1200)).toBe('stacked')
    expect(layout(1575, 1273)).toBe('stacked')
    expect(layout(1920, 1080)).toBe('row')
    for (let windowWidth = 1200; windowWidth <= 3840; windowWidth += 40) {
      for (let windowHeight = 600; windowHeight <= 2200; windowHeight += 10) {
        expect(layout(windowWidth, windowHeight)).not.toBe('hidden')
      }
    }
    expect(shouldUseCompactClock({ windowWidth: 1920, windowHeight: 900 })).toBe(false)
    expect(shouldUseCompactClock({ windowWidth: 1920, windowHeight: 900, extraHeight })).toBe(true)
  })

  it('shrinks the clock rather than dropping the stacked radar when the week takes room', () => {
    const extraHeight = calculateWeekOutlookHeight({ isWeekShown: true, hasWeekToggle: true })
    const fit = (windowWidth: number, windowHeight: number, extra = extraHeight) => {
      const options = { hasRadarCard: true, isRadarInRow: false, windowWidth, windowHeight, extraHeight: extra }
      if (shouldHideStackedRadarCard({ ...options, canCompactClock: true })) return 'hidden'
      return shouldCompactClockForStackedRadar(options) ? 'stacked, compact clock' : 'stacked'
    }

    // A 928x1274 window with the weather map and the week ahead both switched on.
    expect(fit(928, 1274)).toBe('stacked')
    expect(fit(928, 1230)).toBe('stacked, compact clock')
    expect(fit(928, 1230, calculateWeekOutlookHeight({ isWeekShown: false, hasWeekToggle: true }))).toBe('stacked')
    expect(fit(928, 1100)).toBe('hidden')
    expect(compactClockHeightSaving(928)).toBe(36)
  })

  it('never moves the radar between the row and the stacked place when only the toggle state differs', () => {
    // The view places the radar as if the week were shown whenever it has the toggle.
    const reserved = calculateWeekOutlookHeight({ isWeekShown: true, hasWeekToggle: true })
    for (let windowHeight = 900; windowHeight <= 1500; windowHeight += 5) {
      const isRadarInRow = shouldPresentRadarInWeatherRow({ hasRadarCard: true, windowWidth: 1575, windowHeight, extraHeight: reserved })
      for (const isWeekShown of [false, true]) {
        const extraHeight = calculateWeekOutlookHeight({ isWeekShown, hasWeekToggle: true })
        expect(shouldHideStackedRadarCard({ hasRadarCard: true, isRadarInRow, windowWidth: 1575, windowHeight, extraHeight, canCompactClock: true })).toBe(false)
      }
    }
  })
})
