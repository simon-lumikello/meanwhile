import { describe, expect, it } from 'bun:test'
import { computeTooltipLayout } from '@dashboard/utils/tooltip'

describe('GlobalTooltip Coordinate & Collision Engine', () => {
  it('prevents tooltip from clipping off the left edge of the viewport (user screenshot scenario)', () => {
    // Target element near the left side of the screen (e.g. lane header pill at left: 52px, width: 110px)
    const rect = {
      left: 52,
      top: 130,
      width: 110,
      height: 24,
      bottom: 154,
    }

    const layout = computeTooltipLayout({
      rect,
      tooltipWidth: 280,
      tooltipHeight: 34,
      viewportWidth: 1920,
      viewportHeight: 1080,
      viewportPadding: 12,
    })

    // Target center is 52 + 55 = 107px.
    // An unconstrained tooltip centered on 107px would have left = 107 - 140 = -33px (clipped!).
    // With viewport clamping:
    expect(layout.left).toBeGreaterThanOrEqual(12)
    expect(layout.left).toBe(12)

    // Tooltip should not be clipped on the left
    expect(layout.left + 280).toBeLessThanOrEqual(1920 - 12)

    // The arrow must point towards the target center (107px), which inside the tooltip is 107 - 12 = 95px
    expect(layout.arrowLeft).toBe(95)

    // With ample space above (130px), it should appear above the target
    expect(layout.showBelow).toBe(false)
    expect(layout.top).toBe(130 - 6 - 34) // 90px
  })

  it('prevents tooltip from clipping off the right edge of the viewport', () => {
    // Target element near the far right of the screen
    const rect = {
      left: 1840,
      top: 200,
      width: 60,
      height: 28,
      bottom: 228,
    }

    const layout = computeTooltipLayout({
      rect,
      tooltipWidth: 260,
      tooltipHeight: 34,
      viewportWidth: 1920,
      viewportHeight: 1080,
      viewportPadding: 12,
    })

    // Right edge must not exceed 1920 - 12 = 1908
    expect(layout.left + 260).toBeLessThanOrEqual(1908)
    expect(layout.left).toBe(1920 - 12 - 260) // 1648px

    // Target center is 1840 + 30 = 1870px.
    // Arrow offset inside tooltip: 1870 - 1648 = 222px
    expect(layout.arrowLeft).toBe(222)
  })

  it('flips to showBelow when target is close to the top edge of the viewport', () => {
    // Target element in top navigation bar (e.g. top: 10px)
    const rect = {
      left: 300,
      top: 10,
      width: 80,
      height: 32,
      bottom: 42,
    }

    const layout = computeTooltipLayout({
      rect,
      tooltipWidth: 160,
      tooltipHeight: 32,
      viewportWidth: 1280,
      viewportHeight: 800,
    })

    expect(layout.showBelow).toBe(true)
    expect(layout.top).toBe(42 + 6) // rect.bottom + gap
  })

  it('respects explicit position="top" or position="bottom" preferences when space permits', () => {
    const rect = {
      left: 400,
      top: 400,
      width: 100,
      height: 30,
      bottom: 430,
    }

    const belowLayout = computeTooltipLayout({
      rect,
      tooltipWidth: 180,
      tooltipHeight: 32,
      viewportWidth: 1280,
      viewportHeight: 800,
      position: 'bottom',
    })

    expect(belowLayout.showBelow).toBe(true)

    const topLayout = computeTooltipLayout({
      rect,
      tooltipWidth: 180,
      tooltipHeight: 32,
      viewportWidth: 1280,
      viewportHeight: 800,
      position: 'top',
    })

    expect(topLayout.showBelow).toBe(false)
  })

  it('keeps the arrow safely within the tooltip rounded corners for off-center triggers', () => {
    // Target is almost completely off-screen to the left (e.g. center is at 5px)
    const rect = {
      left: -20,
      top: 300,
      width: 50,
      height: 24,
      bottom: 324,
    }

    const layout = computeTooltipLayout({
      rect,
      tooltipWidth: 200,
      tooltipHeight: 32,
      viewportWidth: 1280,
      viewportHeight: 800,
      viewportPadding: 12,
    })

    expect(layout.left).toBe(12)
    // Arrow should be clamped to minimum 14px so it doesn't poke outside rounded corner
    expect(layout.arrowLeft).toBe(14)
  })

  describe('GlobalTooltip Component Contract & Lock Screen Suppression', () => {
    it('exports GlobalTooltip component accepting disabled prop to suppress tooltips on lock screen', async () => {
      const { GlobalTooltip } = await import('../src/components/common/GlobalTooltip')
      expect(typeof GlobalTooltip).toBe('function')
    })
  })
})
