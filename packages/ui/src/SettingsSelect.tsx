import { useRef, useState } from 'react'
import { useAnchoredPopover } from './anchoredPopover'

export interface SettingsSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SettingsSelectProps {
  label: string
  value: string
  options: SettingsSelectOption[]
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
}

/** A Tailwind-styled, keyboard-operable settings listbox with no app-state ownership. */
export function SettingsSelect({ label, value, options, onChange, className = '', disabled = false }: SettingsSelectProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const listStyle = useAnchoredPopover(anchorRef, open, { gap: 6 })
  const selected = options.find(option => option.value === value) ?? options[0]

  return <div
    ref={anchorRef}
    className={`relative ${className}`}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => {
      // Claim Escape while open so an enclosing dialog stays open.
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }}
  >
    <button
      ref={triggerRef}
      type="button"
      className="flex min-h-8 w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-left text-xs font-semibold text-slate-900 shadow-sm transition-colors hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/35 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/15 dark:bg-slate-900 dark:text-white dark:hover:border-slate-500"
      aria-label={label}
      aria-expanded={open}
      aria-haspopup="listbox"
      disabled={disabled}
      onClick={() => setOpen(previous => !previous)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setOpen(true)
        }
      }}
    >
      <span>{selected.label}</span>
      <span className={`h-2 w-2 shrink-0 border-r-2 border-b-2 border-slate-500 transition-transform dark:border-slate-300 ${open ? 'translate-y-0.5 rotate-[225deg]' : '-translate-y-0.5 rotate-45'}`} aria-hidden="true" />
    </button>
    {open && <div style={listStyle} className={`${listStyle ? '' : 'absolute top-[calc(100%+0.35rem)] right-0 left-0'} z-30 overflow-y-auto overscroll-contain rounded-lg border border-indigo-400 bg-white shadow-xl dark:border-indigo-400/75 dark:bg-slate-900`} role="listbox" aria-label={label}>
      {options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} disabled={option.disabled} className="flex min-h-9 w-full items-center border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-800 transition-colors last:border-b-0 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:text-slate-100 dark:hover:bg-indigo-950/70" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus() }}>{option.label}</button>)}
    </div>}
  </div>
}
