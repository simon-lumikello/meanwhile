import { useEffect, useState } from 'react'

/**
 * Responsive hook to detect if the current viewport is mobile (width < breakpoint, default 768px).
 * Automatically updates on window resize or device orientation change.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < breakpoint
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
    }

    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}

/**
 * Responsive hook to detect if the viewport is in portrait orientation (height > width).
 */
export function useIsPortrait(): boolean {
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia('(orientation: portrait)').matches ||
      window.innerHeight > window.innerWidth
    )
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mql = window.matchMedia('(orientation: portrait)')
    const handler = () => {
      setIsPortrait(
        window.matchMedia('(orientation: portrait)').matches ||
        window.innerHeight > window.innerWidth
      )
    }

    mql.addEventListener('change', handler)
    window.addEventListener('resize', handler)
    return () => {
      mql.removeEventListener('change', handler)
      window.removeEventListener('resize', handler)
    }
  }, [])

  return isPortrait
}

/**
 * Convenience hook combining mobile screen width and portrait orientation.
 */
export function useIsMobilePortrait(breakpoint = 768): boolean {
  const isMobile = useIsMobile(breakpoint)
  const isPortrait = useIsPortrait()
  return isMobile && isPortrait
}

/**
 * Responsive hook to detect if the viewport is wide enough to display 3 cards side-by-side
 * (~500px each + gaps + margins) and short enough that stacked 2-row layouts would clip.
 * Derived from the tracked window size during render, so a changed threshold (the week
 * outlook switched on) applies immediately rather than at the next resize.
 */
export function useIsWideAndShortScreen(minWidth = 1500, maxHeight = 1100): boolean {
  const [size, setSize] = useState<{ width: number; height: number } | null>(() => {
    if (typeof window === 'undefined') return null
    return { width: window.innerWidth, height: window.innerHeight }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size !== null && size.width >= minWidth && size.height <= maxHeight
}
