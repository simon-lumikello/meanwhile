import React, { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { computeTooltipLayout } from '@dashboard/utils/tooltip'

interface TooltipState {
  text: string
  rect: DOMRect
  position?: 'top' | 'bottom'
}

interface GlobalTooltipProps {
  isDark?: boolean
  disabled?: boolean
}

export const GlobalTooltip: React.FC<GlobalTooltipProps> = ({ isDark = true, disabled = false }) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActiveTimestampRef = useRef<number>(0)
  const currentTargetRef = useRef<Element | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLDivElement>(null)
  const isTooltipActiveRef = useRef<boolean>(false)
  const hasPositionedRef = useRef<boolean>(false)

  // Derive active tooltip: strictly suppressed when disabled
  const activeTooltip = disabled ? null : tooltip

  useEffect(() => {
    if (disabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      currentTargetRef.current = null
      hasPositionedRef.current = false
      isTooltipActiveRef.current = false
      return
    }

    const handlePointerOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest('[data-tooltip], [title]')
      if (!target) return

      // Intercept and sanitize native title to prevent OS unstyled tooltip
      let text = target.getAttribute('data-tooltip')
      if (!text && target.hasAttribute('title')) {
        const rawTitle = target.getAttribute('title') || ''
        if (rawTitle.trim()) {
          text = rawTitle
          target.setAttribute('data-tooltip', rawTitle)
        }
        target.removeAttribute('title')
      }

      if (!text || !text.trim()) return

      // Ignore if already hovering this target
      if (currentTargetRef.current === target && isTooltipActiveRef.current) return

      currentTargetRef.current = target
      const rect = target.getBoundingClientRect()
      const preferredPos = (target.getAttribute('data-tooltip-position') as 'top' | 'bottom') || undefined

      // If user recently viewed a tooltip within 350ms, switch immediately without delay
      const now = Date.now()
      const isWarm = now - lastActiveTimestampRef.current < 350
      const delay = isWarm ? 0 : 120

      if (timerRef.current) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
        isTooltipActiveRef.current = true
        setTooltip({
          text: text!.trim(),
          rect,
          position: preferredPos,
        })
        lastActiveTimestampRef.current = Date.now()
      }, delay)
    }

    const handlePointerOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null
      if (related && currentTargetRef.current && currentTargetRef.current.contains(related)) {
        return
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      currentTargetRef.current = null
      hasPositionedRef.current = false
      isTooltipActiveRef.current = false
      setTooltip(null)
      lastActiveTimestampRef.current = Date.now()
    }

    const handleDismiss = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      currentTargetRef.current = null
      hasPositionedRef.current = false
      isTooltipActiveRef.current = false
      setTooltip(null)
    }

    document.addEventListener('mouseover', handlePointerOver, { passive: true })
    document.addEventListener('mouseout', handlePointerOut, { passive: true })
    window.addEventListener('scroll', handleDismiss, { passive: true, capture: true })
    window.addEventListener('mousedown', handleDismiss, { passive: true })
    window.addEventListener('keydown', handleDismiss, { passive: true })
    window.addEventListener('resize', handleDismiss, { passive: true })

    return () => {
      document.removeEventListener('mouseover', handlePointerOver)
      document.removeEventListener('mouseout', handlePointerOut)
      window.removeEventListener('scroll', handleDismiss, { capture: true })
      window.removeEventListener('mousedown', handleDismiss)
      window.removeEventListener('keydown', handleDismiss)
      window.removeEventListener('resize', handleDismiss)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [disabled])

  // Synchronously measure and refine position before browser paint
  useLayoutEffect(() => {
    if (!activeTooltip || !tooltipRef.current) return

    const el = tooltipRef.current
    const arrowEl = arrowRef.current
    const width = el.offsetWidth
    const height = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    const layout = computeTooltipLayout({
      rect: activeTooltip.rect,
      tooltipWidth: width,
      tooltipHeight: height,
      viewportWidth: vw,
      viewportHeight: vh,
      position: activeTooltip.position,
    })

    el.style.left = `${layout.left}px`
    el.style.top = `${layout.top}px`

    if (arrowEl) {
      arrowEl.style.left = `${layout.arrowLeft}px`
    }

    // Enable smooth glide transition only after initial placement
    if (!hasPositionedRef.current) {
      hasPositionedRef.current = true
      requestAnimationFrame(() => {
        if (tooltipRef.current) {
          tooltipRef.current.classList.add('transition-[left,top]', 'duration-100', 'ease-out')
        }
      })
    }
  }, [activeTooltip])

  if (!activeTooltip) return null

  const { rect, text, position } = activeTooltip

  // Initial estimate to position element cleanly on initial render
  const estimatedWidth = Math.min(320, Math.max(80, text.length * 7.5 + 24))
  const estimatedHeight = text.length > 35 ? 44 : 32
  const initialLayout = computeTooltipLayout({
    rect,
    tooltipWidth: estimatedWidth,
    tooltipHeight: estimatedHeight,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 768,
    position,
  })

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] pointer-events-none select-none"
      style={{
        left: `${initialLayout.left}px`,
        top: `${initialLayout.top}px`,
      }}
    >
      <div
        className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-2xl backdrop-blur-md border max-w-xs max-w-[calc(100vw-24px)] text-center leading-snug break-words animate-in fade-in zoom-in-95 duration-100 ${
          isDark
            ? 'bg-slate-900/95 text-slate-100 border-white/15 shadow-black/70 shadow-lg'
            : 'bg-white/95 text-slate-900 border-slate-200/90 shadow-slate-900/15 shadow-lg'
        }`}
      >
        {text}

        {/* Pointer Arrow */}
        <div
          ref={arrowRef}
          className={`absolute w-2 h-2 border-solid pointer-events-none ${
            initialLayout.showBelow
              ? '-top-1 ' +
                (isDark
                  ? 'bg-slate-900 border-t border-l border-white/15'
                  : 'bg-white border-t border-l border-slate-200/90')
              : '-bottom-1 ' +
                (isDark
                  ? 'bg-slate-900 border-b border-r border-white/15'
                  : 'bg-white border-b border-r border-slate-200/90')
          }`}
          style={{
            left: `${initialLayout.arrowLeft}px`,
            transform: 'translateX(-50%) rotate(45deg)',
          }}
        />
      </div>
    </div>
  )
}

