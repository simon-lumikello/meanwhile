import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Button } from './Button'

export type DialogPlacement = 'center' | 'end'
export type DialogSize = 'sm' | 'md' | 'lg'

export interface DialogProps {
  open: boolean
  /** Called for the close button, Escape, and a click on the backdrop outside the panel. */
  onClose: () => void
  /** Heading rendered in the dialog's header; it also names the dialog. */
  title?: ReactNode
  description?: ReactNode
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode
  /** Leading header icon. */
  icon?: ReactNode
  /** Footer content, typically action buttons; it stays visible while the body scrolls. */
  footer?: ReactNode
  children?: ReactNode
  /** `center` is a modal card; `end` is a full-height drawer on the inline end side. */
  placement?: DialogPlacement
  size?: DialogSize
  /** Accessible name of the header close button. */
  closeLabel?: string
  /** Show the header close button; defaults to showing it whenever there is a title. */
  showCloseButton?: boolean
  /** Id of an element naming the dialog, for dialogs that render their own heading instead of `title`. */
  labelledBy?: string
  /** Extra classes and styles for the dialog panel. */
  className?: string
  style?: CSSProperties
  bodyClassName?: string
  /** Drop the body's padding, for content that lays out its own (tab bars, full-bleed media). */
  flush?: boolean
}

// Open dialogs, innermost last: only the topmost one reacts to Escape and traps Tab.
const openDialogs: object[] = []

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const PANEL_SIZE: Record<DialogPlacement, Record<DialogSize, string>> = {
  center: { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' },
  end: { sm: 'sm:w-[28rem]', md: 'sm:w-[36rem]', lg: 'sm:w-[680px] lg:w-[720px]' },
}

function CloseIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
}

/**
 * A modal dialog rendered in place (not portalled), so it inherits the host's theme
 * class. It closes on Escape, on the close button, and on a click outside the panel;
 * focus moves into the panel while open and returns to the opener afterwards.
 * Dialogs opened later stack above earlier ones.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  eyebrow,
  icon,
  footer,
  children,
  placement = 'center',
  size = 'md',
  closeLabel = 'Close',
  showCloseButton,
  labelledBy,
  className = '',
  style,
  bodyClassName = '',
  flush = false,
}: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const pressedBackdrop = useRef(false)

  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const token = {}
    openDialogs.push(token)
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== token || !panel) return
      if (event.key === 'Escape') {
        // Inner controls (open listboxes, autocompletes) claim Escape with preventDefault.
        if (event.defaultPrevented) return
        event.preventDefault()
        onCloseRef.current()
      } else if (event.key === 'Tab') {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(element => element.getClientRects().length > 0)
        if (focusable.length === 0) {
          event.preventDefault()
          panel.focus()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || active === panel || !panel.contains(active))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      openDialogs.splice(openDialogs.indexOf(token), 1)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  const hasHeader = title !== undefined || eyebrow !== undefined || description !== undefined || icon !== undefined
  // A header with only a title (and optional icon) centres its content against the close button; with an eyebrow or description it aligns to the top.
  const titleOnly = eyebrow === undefined && description === undefined
  const withCloseButton =showCloseButton ?? title !== undefined
  const isDrawer = placement === 'end'

  return <div
    className={`fixed inset-0 z-[200] flex bg-black/60 backdrop-blur-sm ${isDrawer ? 'justify-end' : 'items-center justify-center p-3 sm:p-4'}`}
    data-dialog-backdrop=""
    onPointerDown={event => { pressedBackdrop.current = event.target === event.currentTarget }}
    onClick={event => {
      // Close only when the press started and ended outside the panel, so a text selection dragged out of it does not.
      if (pressedBackdrop.current && event.target === event.currentTarget) onCloseRef.current()
      pressedBackdrop.current = false
    }}
  >
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title !== undefined ? titleId : labelledBy}
      aria-describedby={description !== undefined ? descriptionId : undefined}
      tabIndex={-1}
      style={style}
      className={`relative flex w-full flex-col overflow-hidden border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 ${isDrawer ? 'h-full max-w-full border-y-0 border-r-0' : 'max-h-[min(90dvh,52rem)] rounded-2xl'} ${PANEL_SIZE[placement][size]} ${className}`}
    >
      {hasHeader && <div className={`flex shrink-0 gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10 ${titleOnly ? 'items-center' : 'items-start'}`}>
        {icon && <div className={`flex shrink-0 items-center ${titleOnly ? '' : 'mt-0.5'}`}>{icon}</div>}
        <div className="min-w-0 flex-1">
          {eyebrow !== undefined && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-600 dark:text-sky-300">{eyebrow}</p>}
          {title !== undefined && <h2 id={titleId} className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-white">{title}</h2>}
          {description !== undefined && <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {withCloseButton && <Button variant="ghost" tone="neutral" icon={<CloseIcon />} aria-label={closeLabel} title={closeLabel} onClick={() => onCloseRef.current()} className={titleOnly ? '-my-1 -mr-2' : '-mt-1 -mr-2'} />}
      </div>}
      {!hasHeader && withCloseButton && <Button variant="ghost" tone="neutral" icon={<CloseIcon />} aria-label={closeLabel} title={closeLabel} onClick={() => onCloseRef.current()} className="absolute top-3 right-3 z-10" />}
      <div className={`min-h-0 flex-1 overflow-y-auto ${flush ? '' : 'px-5 py-4'} ${bodyClassName}`}>{children}</div>
      {footer !== undefined && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-white/10 dark:bg-slate-950/40">{footer}</div>}
    </div>
  </div>
}
