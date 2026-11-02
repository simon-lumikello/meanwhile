export interface TooltipLayoutOptions {
  rect: { left: number; top: number; width: number; height: number; bottom: number }
  tooltipWidth: number
  tooltipHeight: number
  viewportWidth: number
  viewportHeight: number
  position?: 'top' | 'bottom'
  viewportPadding?: number
  gap?: number
}

export interface TooltipLayoutResult {
  left: number
  top: number
  arrowLeft: number
  showBelow: boolean
}

/**
 * Computes viewport-bounded tooltip position and arrow alignment.
 * Guarantees that tooltip never bleeds off the viewport edges and that
 * the arrow points accurately at the target element.
 */
export function computeTooltipLayout({
  rect,
  tooltipWidth,
  tooltipHeight,
  viewportWidth,
  viewportHeight,
  position,
  viewportPadding = 12,
  gap = 6,
}: TooltipLayoutOptions): TooltipLayoutResult {
  const centerX = rect.left + rect.width / 2
  const idealLeft = centerX - tooltipWidth / 2
  const left = Math.max(
    viewportPadding,
    Math.min(viewportWidth - viewportPadding - tooltipWidth, idealLeft)
  )

  const spaceAbove = rect.top
  const spaceBelow = viewportHeight - rect.bottom

  const showBelow =
    position === 'bottom'
      ? spaceBelow >= tooltipHeight + gap || spaceBelow >= spaceAbove
      : position === 'top'
      ? spaceAbove < tooltipHeight + gap && spaceBelow > spaceAbove
      : spaceAbove < tooltipHeight + gap + 12 && spaceBelow > spaceAbove

  let top: number
  if (showBelow) {
    top = Math.min(viewportHeight - viewportPadding - tooltipHeight, rect.bottom + gap)
  } else {
    top = Math.max(viewportPadding, rect.top - gap - tooltipHeight)
  }

  const arrowX = centerX - left
  // Constrain arrow within the pill's rounded borders (8px radius + padding)
  const arrowLeft = Math.max(14, Math.min(tooltipWidth - 14, arrowX))

  return {
    left: Math.round(left),
    top: Math.round(top),
    arrowLeft: Math.round(arrowLeft),
    showBelow,
  }
}
