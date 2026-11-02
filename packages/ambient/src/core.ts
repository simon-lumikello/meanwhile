export function calculateAmbientBackground(isDimmed: boolean, backgroundDim = 80): string {
  if (!isDimmed) return '#090d16'

  const darknessFactor = Math.max(0.4, Math.min(1, backgroundDim / 100))
  const red = Math.round(9 * (1 - darknessFactor))
  const green = Math.round(13 * (1 - darknessFactor))
  const blue = Math.round(22 * (1 - darknessFactor))
  return `rgb(${red}, ${green}, ${blue})`
}

/** Height the week outlook row (five compact day cards) adds under the weather cards. */
export const WEEK_OUTLOOK_ROW_HEIGHT = 170
/** Height the on-screen week toggle adds under the weather cards (it tucks into their bottom padding). */
export const WEEK_TOGGLE_HEIGHT = 20

/**
 * Height the compact clock gives back at this window width: the full and compact clock
 * sizes differ by 24px on phones, 36px on tablets and 56px from 1024px up.
 */
export function compactClockHeightSaving(windowWidth: number): number {
  if (windowWidth >= 1024) return 56
  if (windowWidth >= 768) return 36
  return 24
}

/**
 * Extra height the week outlook takes below the weather cards; the layout rules below make
 * room for it (see weekOutlookLayoutCost) so the clock, cards and radar still fit.
 */
export function calculateWeekOutlookHeight({ isWeekShown, hasWeekToggle }: { isWeekShown: boolean; hasWeekToggle: boolean }): number {
  return (isWeekShown ? WEEK_OUTLOOK_ROW_HEIGHT : 0) + (hasWeekToggle ? WEEK_TOGGLE_HEIGHT : 0)
}

/**
 * The height thresholds below keep about this much margin over the measured worst case
 * (full clock, rain timelines on both cards); content under the cards may use it first.
 */
const LAYOUT_MARGIN = 60

/** How far content under the cards (the week outlook) raises the height thresholds. */
export function weekOutlookLayoutCost(extraHeight: number): number {
  return Math.max(0, extraHeight - LAYOUT_MARGIN)
}

/**
 * How far that content raises the in-row radar threshold: the stacked radar keeps its place
 * as long as the compact clock makes room for it.
 */
export function weekOutlookRowAllowance(extraHeight: number, windowWidth: number): number {
  return Math.max(0, weekOutlookLayoutCost(extraHeight) - compactClockHeightSaving(windowWidth))
}

export interface RadarRowLayoutOptions {
  hasRadarCard: boolean
  windowWidth: number
  windowHeight: number
  minWidthThreshold?: number
  maxHeightThreshold?: number
  /** Content below the weather cards (the week outlook), in pixels. */
  extraHeight?: number
}

/**
 * The stacked radar card grows into the height left under the weather cards, down to
 * 300px (AmbientView's min-h-[300px]). The two-column layout needs about 820px for the page
 * padding, clock and weather cards, so below this height there is no room for that radar card.
 */
const MIN_HEIGHT_FOR_STACKED_RADAR_TWO_COLUMN = 1120

/**
 * Screens with room below the weather cards stack a wide radar card there. Whenever the screen
 * is too short for that but wide enough for three cards side by side, the radar joins the
 * weather row instead, so no wide screen falls between the two layouts and loses the radar.
 */
export function shouldPresentRadarInWeatherRow({
  hasRadarCard,
  windowWidth,
  windowHeight,
  minWidthThreshold = 1200,
  maxHeightThreshold = MIN_HEIGHT_FOR_STACKED_RADAR_TWO_COLUMN - 1,
  extraHeight = 0,
}: RadarRowLayoutOptions): boolean {
  return Boolean(
    hasRadarCard &&
    windowWidth >= minWidthThreshold &&
    windowHeight <= maxHeightThreshold + weekOutlookRowAllowance(extraHeight, windowWidth),
  )
}

export interface StackedRadarFitOptions {
  hasRadarCard: boolean
  isRadarInRow: boolean
  windowWidth: number
  windowHeight: number
  singleColumnBreakpoint?: number
  minHeightForStackedRadarSingleColumn?: number
  minHeightForStackedRadarTwoColumn?: number
  /** Content below the weather cards (the week outlook), in pixels. */
  extraHeight?: number
  /** The view may shrink the clock to make room (see shouldCompactClockForStackedRadar). */
  canCompactClock?: boolean
}

/**
 * The radar card renders full-width below the weather cards whenever the screen isn't wide
 * and short enough to place it in-row (see shouldPresentRadarInWeatherRow). On screens too
 * short for even the minimum stacked card it would run past the bottom of a fixed-size kiosk
 * display with no way to scroll into view. Hide it in that case rather than clip it; with
 * `canCompactClock`, only once even the compact clock leaves too little room.
 */
export function shouldHideStackedRadarCard({
  hasRadarCard,
  isRadarInRow,
  windowWidth,
  windowHeight,
  singleColumnBreakpoint = 768,
  minHeightForStackedRadarSingleColumn = 1500,
  minHeightForStackedRadarTwoColumn = MIN_HEIGHT_FOR_STACKED_RADAR_TWO_COLUMN,
  extraHeight = 0,
  canCompactClock = false,
}: StackedRadarFitOptions): boolean {
  if (!hasRadarCard || isRadarInRow) return false
  const minHeightRequired = windowWidth < singleColumnBreakpoint
    ? minHeightForStackedRadarSingleColumn
    : minHeightForStackedRadarTwoColumn
  const clockSaving = canCompactClock ? compactClockHeightSaving(windowWidth) : 0
  return windowHeight < minHeightRequired + weekOutlookLayoutCost(extraHeight) - clockSaving
}

/**
 * The stacked radar fits only with the compact clock: shrink the clock rather than drop the
 * map (for example when the week outlook takes room under the cards).
 */
export function shouldCompactClockForStackedRadar(options: Omit<StackedRadarFitOptions, 'canCompactClock'>): boolean {
  return shouldHideStackedRadarCard({ ...options, canCompactClock: false })
    && !shouldHideStackedRadarCard({ ...options, canCompactClock: true })
}

export interface CompactClockOptions {
  windowWidth: number
  windowHeight: number
  singleColumnBreakpoint?: number
  minHeightForFullClockSingleColumn?: number
  minHeightForFullClockTwoColumn?: number
  /** Content below the weather cards (the week outlook), in pixels. */
  extraHeight?: number
}

/**
 * Below these heights the clock + weather cards themselves risk clipping (independent of the
 * radar card, which is hidden separately by shouldHideStackedRadarCard). Shrinking the clock
 * reclaims vertical space rather than letting the weather cards get cut off.
 */
export function shouldUseCompactClock({
  windowWidth,
  windowHeight,
  singleColumnBreakpoint = 768,
  minHeightForFullClockSingleColumn = 1150,
  minHeightForFullClockTwoColumn = 820,
  extraHeight = 0,
}: CompactClockOptions): boolean {
  const minHeightRequired = windowWidth < singleColumnBreakpoint
    ? minHeightForFullClockSingleColumn
    : minHeightForFullClockTwoColumn
  return windowHeight < minHeightRequired + weekOutlookLayoutCost(extraHeight)
}
