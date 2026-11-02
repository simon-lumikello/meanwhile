import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useAnchoredPopover } from './anchoredPopover'
import { formatLocationOption, type LocationSearchOption } from './locationOption'

export interface LocationSearchProps<T extends LocationSearchOption> {
  /** Accessible name of the search field. */
  label: string
  /** The saved location; the field shows it until the user types, and again after a choice. */
  value: string
  /** Called with the trimmed text once typing pauses; feed it to the host's search query. */
  onSearch: (query: string) => void
  /** Suggestions for the latest search. */
  results?: readonly T[]
  isLoading?: boolean
  isError?: boolean
  onSelect: (option: T) => void
  placeholder?: string
  size?: 'sm' | 'md'
  /** Classes for the wrapper, for example a width. */
  className?: string
  /** Characters needed before searching. */
  minLength?: number
  /** Milliseconds typing must pause before `onSearch`. */
  debounceMs?: number
  messages?: { searching?: string; error?: string; empty?: string }
}

const INPUT_SIZE = {
  sm: 'h-7 rounded-lg pl-2.5 pr-7 text-xs',
  md: 'h-10 rounded-lg pl-3 pr-9 text-sm',
}

/**
 * A location combobox: the host owns the search request (for example weather's
 * `useLocationSearchQuery`) and passes its results in. Arrow keys move through the
 * suggestions, Enter picks one, and Escape closes them without closing an
 * enclosing dialog.
 */
export function LocationSearch<T extends LocationSearchOption>({
  label,
  value,
  onSearch,
  results = [],
  isLoading = false,
  isError = false,
  onSelect,
  placeholder,
  size = 'md',
  className = '',
  minLength = 2,
  debounceMs = 250,
  messages = {},
}: LocationSearchProps<T>) {
  const listboxId = useId()
  // The typed text belongs to the value it was typed over; a new value resets it.
  const [input, setInput] = useState({ source: value, text: value })
  const text = input.source === value ? input.text : value
  // Whether suggestions may show: set by focus and typing, cleared by blur, Escape, and a choice.
  const [showList, setShowList] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [searched, setSearched] = useState<string | null>(null)
  const onSearchRef = useRef(onSearch)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onSearchRef.current = onSearch
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  const query = text.trim()
  const isEdited = text !== value
  const isOpen = showList && isEdited && query.length >= minLength
  const isSearching = isLoading || searched !== query
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0))
  const listStyle = useAnchoredPopover(anchorRef, isOpen, { align: 'end' })

  const changeText = (next: string) => {
    setInput({ source: value, text: next })
    setActiveIndex(0)
    clearTimeout(timer.current)
    const trimmed = next.trim()
    timer.current = setTimeout(() => {
      setSearched(trimmed)
      onSearchRef.current(trimmed)
    }, debounceMs)
  }

  const choose = (option: T) => {
    clearTimeout(timer.current)
    setInput({ source: value, text: formatLocationOption(option) })
    setSearched(null)
    setShowList(false)
    onSelect(option)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown' && isEdited && query.length >= minLength) {
        event.preventDefault()
        setShowList(true)
      }
      return
    }
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault()
      setActiveIndex(Math.min(active + 1, results.length - 1))
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault()
      setActiveIndex(Math.max(active - 1, 0))
    } else if (event.key === 'Enter' && !isSearching && results[active]) {
      event.preventDefault()
      choose(results[active])
    } else if (event.key === 'Escape') {
      // Close the suggestions, not an enclosing dialog.
      event.preventDefault()
      setShowList(false)
    }
  }

  const status = isError ? messages.error ?? 'Location search is unavailable. Try again shortly.'
    : isSearching ? messages.searching ?? 'Searching…'
      : results.length === 0 ? messages.empty ?? 'No places found. Try a more specific name.'
        : undefined

  return <div ref={anchorRef} className={`relative ${className}`}>
    <input
      type="text"
      role="combobox"
      aria-label={label}
      aria-autocomplete="list"
      aria-expanded={isOpen}
      aria-controls={listboxId}
      aria-activedescendant={isOpen && !status ? `${listboxId}-${active}` : undefined}
      autoComplete="off"
      spellCheck={false}
      value={text}
      placeholder={placeholder}
      onFocus={() => setShowList(true)}
      onBlur={() => setShowList(false)}
      onChange={event => { setShowList(true); changeText(event.target.value) }}
      onKeyDown={handleKeyDown}
      className={`w-full border border-slate-300 bg-white text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-white/15 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:hover:border-slate-500 ${INPUT_SIZE[size]}`}
    />
    {isOpen && isSearching && !isError && <span className={`pointer-events-none absolute top-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500 dark:border-slate-600 dark:border-t-sky-400 ${size === 'sm' ? 'right-2 h-3 w-3' : 'right-3 h-4 w-4'}`} aria-hidden="true" />}
    {isOpen && <div id={listboxId} role="listbox" aria-label={`${label} suggestions`} style={listStyle} className={`${listStyle ? '' : 'absolute top-full right-0 mt-1 min-w-full'} z-50 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-indigo-300 bg-white shadow-xl dark:border-indigo-400/60 dark:bg-slate-900`}>
      {status
        ? <p className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400" role="status">{status}</p>
        : results.map((option, index) => <button
          key={`${formatLocationOption(option)}-${index}`}
          id={`${listboxId}-${index}`}
          type="button"
          role="option"
          aria-selected={index === active}
          tabIndex={-1}
          onMouseDown={event => { event.preventDefault(); choose(option) }}
          onMouseEnter={() => setActiveIndex(index)}
          className={`flex w-full cursor-pointer flex-col items-start gap-0.5 border-b border-slate-200 px-3 py-2 text-left last:border-b-0 dark:border-white/10 ${index === active ? 'bg-indigo-50 dark:bg-indigo-500/15' : ''}`}
        >
          <strong className="text-xs font-semibold text-slate-900 dark:text-white">{option.name}</strong>
          {(option.admin1 || option.country) && <span className="text-[11px] text-slate-500 dark:text-slate-400">{[option.admin1, option.country].filter(Boolean).join(', ')}</span>}
        </button>)}
    </div>}
  </div>
}
