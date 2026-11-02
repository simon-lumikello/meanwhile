import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

export interface AnchorRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface PopoverPlacementOptions {
  /** Gap between the anchor and the popover, in pixels. */
  gap?: number
  /** Distance the popover keeps from the viewport edges, in pixels. */
  margin?: number
  /** Height below the anchor that is enough to open downwards without comparing sides. */
  preferredHeight?: number
  /** Which anchor edge the popover lines up with. */
  align?: 'start' | 'end'
}

/**
 * Fixed-position styles that attach a popover to its anchor. Fixed positioning lets a
 * listbox inside a scrolling container (a dialog body) overflow it instead of being
 * clipped. It opens below the anchor, or above when there is clearly more room there,
 * and its height is capped to the room on the chosen side.
 */
export function placePopover(anchor: AnchorRect, viewport: ViewportSize, {
  gap = 4,
  margin = 8,
  preferredHeight = 240,
  align = 'start',
}: PopoverPlacementOptions = {}): CSSProperties {
  const below = viewport.height - anchor.bottom - gap - margin
  const above = anchor.top - gap - margin
  const openUp = below < preferredHeight && above > below
  const vertical: CSSProperties = openUp
    ? { bottom: viewport.height - anchor.top + gap, maxHeight: Math.max(above, 0) }
    : { top: anchor.bottom + gap, maxHeight: Math.max(below, 0) }
  const horizontal: CSSProperties = align === 'end'
    ? { right: Math.max(viewport.width - anchor.right, margin) }
    : { left: Math.max(anchor.left, margin) }
  return { position: 'fixed', minWidth: anchor.right - anchor.left, ...vertical, ...horizontal }
}

/**
 * Tracks `anchorRef` while `open` and returns `placePopover` styles for it. Listeners
 * exist only while open and follow scrolling in any ancestor and viewport resizes.
 */
export function useAnchoredPopover(anchorRef: RefObject<HTMLElement | null>, open: boolean, options?: PopoverPlacementOptions): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined)
  const align = options?.align
  const gap = options?.gap
  const margin = options?.margin
  const preferredHeight = options?.preferredHeight

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!open || !anchor) return
    let frame = 0
    const update = () => {
      frame = 0
      const root = document.documentElement
      setStyle(placePopover(anchor.getBoundingClientRect(), { width: root.clientWidth, height: root.clientHeight }, { align, gap, margin, preferredHeight }))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [anchorRef, open, align, gap, margin, preferredHeight])

  return open ? style : undefined
}
