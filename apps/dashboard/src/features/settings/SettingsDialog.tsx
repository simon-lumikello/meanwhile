import React, { useCallback, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Button, Dialog } from '@simon-lumikello/meanwhile-ui/react'
import {
  Layers,
  Monitor,
  Moon,
  MapIcon,
  HardDrive,
  ShieldCheck,
  Search,
  X,
  CornerDownLeft,
  Info,
} from 'lucide-react'
import type { DashboardConfig } from './types'
import { isDashboardRadarEligible } from '@dashboard/services/radar/radarEligibility'
import { PRESET_COLORS, AVAILABLE_ICONS } from './settingsConstants'
import {
  SETTINGS_SEARCH_INDEX,
  SETTINGS_SECTION_LABELS,
  searchSettings,
  type SettingsSearchEntry,
  type SettingsTab,
} from './settingsSearch'
import { LanesTab } from './tabs/LanesTab'
import { DisplayTab } from './tabs/DisplayTab'
import { AmbientTab } from './tabs/AmbientTab'
import { RadarTab } from './tabs/RadarTab'
import { BackupTab } from './tabs/BackupTab'

export { PRESET_COLORS, AVAILABLE_ICONS }

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  config: DashboardConfig
  onSaveConfig: (cfg: DashboardConfig) => void
  onOpenPrivacy: () => void
  onOpenSelfHost?: () => void
}

type IconComponent = React.FC<{ size?: number; className?: string }>

const SECTION_ICONS: Record<SettingsTab, IconComponent> = {
  swimlanes: Layers,
  display: Monitor,
  ambient: Moon,
  radar: MapIcon,
  backup: HardDrive,
}

const SECTION_DESCRIPTIONS: Record<SettingsTab, string> = {
  swimlanes: 'Family calendars and the weather lane, in the order they appear on the timeline.',
  display: 'Theme, clock, and how the timeline looks on the wall.',
  ambient: 'The dimmed clock and weather screen shown at night and after the day’s last event.',
  radar: 'The live weather map on the timeline and on the night screen.',
  backup: 'Move your settings to another screen, restore them, or start over.',
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Scroll a setting's row into view and briefly outline it, so the eye finds it. */
function revealSetting(row: HTMLElement, moveFocus: boolean) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  row.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  // A finite Web Animation needs no timer to clean up.
  row.animate?.(
    [
      { outline: '2px solid rgb(99 102 241 / 0.9)', outlineOffset: '3px' },
      { outline: '2px solid rgb(99 102 241 / 0.9)', outlineOffset: '3px', offset: 0.6 },
      { outline: '2px solid rgb(99 102 241 / 0)', outlineOffset: '3px' },
    ],
    { duration: reduceMotion ? 1200 : 1800, easing: 'ease-out' },
  )
  if (moveFocus) {
    // An anchor may sit on the control itself (a lane's name field) or on the row around it.
    const control = row.matches(FOCUSABLE) ? row : row.querySelector<HTMLElement>(FOCUSABLE)
    control?.focus({ preventScroll: true })
  }
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onOpenPrivacy,
  onOpenSelfHost,
}) => {
  const idPrefix = useId()
  const panelId = `${idPrefix}-panel`
  const resultsId = `${idPrefix}-results`
  const tabId = (tab: SettingsTab) => `${idPrefix}-tab-${tab}`
  const resultId = (index: number) => `${idPrefix}-result-${index}`

  const [pendingCalendarImports, setPendingCalendarImports] = useState<Set<string>>(() => new Set())
  const [saveError, setSaveError] = useState<string | null>(null)
  const onImportPendingChange = useCallback((laneId: string, pending: boolean) => {
    setPendingCalendarImports((prev) => {
      if (prev.has(laneId) === pending) return prev
      const next = new Set(prev)
      if (pending) next.add(laneId)
      else next.delete(laneId)
      return next
    })
  }, [])
  const [activeTab, setActiveTab] = useState<SettingsTab>('swimlanes')
  const [editingConfig, setEditingConfig] = useState<DashboardConfig>(config)
  const [query, setQuery] = useState('')
  const [activeResult, setActiveResult] = useState(0)
  // A note shown above a section when a search result landed on a stand-in for a hidden setting.
  const [jumpHint, setJumpHint] = useState<{ tab: SettingsTab; text: string } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({})

  const activeWeatherLane =
    editingConfig.swimlanes.find((l) => l.enabled && l.type === 'weather') ||
    editingConfig.swimlanes.find((l) => l.type === 'weather')
  const weatherProviderId = activeWeatherLane?.source.weatherProviderId || 'open-meteo'
  const weatherLat = activeWeatherLane?.source.weatherLatitude
  const weatherLon = activeWeatherLane?.source.weatherLongitude
  const isRadarSupported = isDashboardRadarEligible(weatherProviderId, weatherLat, weatherLon)

  // If radar is not supported, effectively fall back to 'swimlanes'
  const effectiveTab: SettingsTab =
    activeTab === 'radar' && !isRadarSupported ? 'swimlanes' : activeTab

  const sections: SettingsTab[] = ['swimlanes', 'display', 'ambient', ...(isRadarSupported ? ['radar' as const] : []), 'backup']
  const isSearching = query.trim() !== ''
  const results = isSearching
    ? searchSettings(query, SETTINGS_SEARCH_INDEX.filter((entry) => sections.includes(entry.section)))
    : []
  const highlighted = Math.min(activeResult, Math.max(results.length - 1, 0))

  const handleSave = () => {
    try {
      onSaveConfig(editingConfig)
      onClose()
    } catch {
      setSaveError('Could not save settings to this browser. Storage may be full or unavailable. Remove an imported calendar or use a smaller file, then try Apply again.')
    }
  }

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab)
    setQuery('')
    setJumpHint(null)
    if (contentRef.current) contentRef.current.scrollTop = 0
  }

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = sections.indexOf(effectiveTab)
    let next: number | null = null
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % sections.length
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + sections.length) % sections.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = sections.length - 1
    if (next === null) return
    event.preventDefault()
    selectTab(sections[next])
    tabRefs.current[sections[next]]?.focus()
  }

  const openResult = (entry: SettingsSearchEntry, fromKeyboard: boolean) => {
    // Render the section synchronously so its rows exist to scroll to.
    flushSync(() => {
      setActiveTab(entry.section)
      setQuery('')
      setActiveResult(0)
      setJumpHint(null)
    })
    const content = contentRef.current
    if (!content) return
    let row = content.querySelector<HTMLElement>(`[data-setting-id="${entry.id}"]`)
    if (!row && entry.fallback) {
      row = content.querySelector<HTMLElement>(`[data-setting-id="${entry.fallback.id}"]`)
      const hint = entry.fallback.hint
      flushSync(() => setJumpHint({ tab: entry.section, text: `${entry.label}: ${hint}` }))
    }
    if (row) revealSetting(row, fromKeyboard)
    // A tap keeps focus in the dialog without raising an on-screen keyboard.
    if (!fromKeyboard || !row) panelRef.current?.focus({ preventScroll: true })
  }

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query !== '') {
      // Clear the search, not close the dialog.
      event.preventDefault()
      setQuery('')
      setActiveResult(0)
    } else if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault()
      setActiveResult((highlighted + 1) % results.length)
    } else if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault()
      setActiveResult((highlighted - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && results.length > 0) {
      event.preventDefault()
      openResult(results[highlighted].entry, true)
    }
  }

  const ActiveIcon = SECTION_ICONS[effectiveTab]

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="xl"
      title="Dashboard Settings"
      closeLabel="Close Settings"
      flush
      footer={
        <>
          <Button
            id="settings-privacy-link"
            variant="ghost"
            tone="neutral"
            onClick={onOpenPrivacy}
            icon={<ShieldCheck />}
            className="mr-auto"
          >
            Privacy & Data
          </Button>
          <Button variant="ghost" tone="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="solid" tone="primary" onClick={handleSave} disabled={pendingCalendarImports.size > 0}>
            Apply
          </Button>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        {/* Navigation: search above the sections; a rail on wide screens, a tab strip on narrow ones */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-slate-50 p-3 md:w-56 md:gap-3 md:border-r md:border-b-0 dark:border-white/10 dark:bg-slate-950/40">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <input
              type="search"
              role="combobox"
              aria-label="Search settings"
              aria-expanded={isSearching}
              aria-controls={isSearching && results.length > 0 ? resultsId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={isSearching && results.length > 0 ? resultId(highlighted) : undefined}
              placeholder="Search settings"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveResult(0)
              }}
              onKeyDown={onSearchKeyDown}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pr-8 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query !== '' && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setActiveResult(0)
                }}
                aria-label="Clear search"
                title="Clear search"
                className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Settings sections"
            aria-orientation="vertical"
            className="-mx-3 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-1 md:flex-col md:overflow-x-visible md:overflow-y-auto md:px-0"
          >
            {sections.map((tab) => {
              const Icon = SECTION_ICONS[tab]
              const isSelected = !isSearching && effectiveTab === tab
              const badge = tab === 'swimlanes' ? editingConfig.swimlanes.length : undefined
              return (
                <button
                  key={tab}
                  ref={(element) => {
                    tabRefs.current[tab] = element
                  }}
                  id={tabId(tab)}
                  type="button"
                  role="tab"
                  aria-selected={effectiveTab === tab}
                  aria-controls={panelId}
                  tabIndex={effectiveTab === tab ? 0 : -1}
                  onClick={() => selectTab(tab)}
                  onKeyDown={onTabKeyDown}
                  className={`flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${
                    tab === 'backup' ? 'md:mt-auto' : ''
                  } ${
                    isSelected
                      ? 'bg-indigo-600/10 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300'
                      : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon size={16} className={isSelected ? '' : 'opacity-70'} />
                  <span className="md:flex-1 md:text-left">{SETTINGS_SECTION_LABELS[tab]}</span>
                  {badge !== undefined && (
                    <span
                      className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                        isSelected
                          ? 'bg-indigo-600/15 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-200'
                          : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content: the selected section, or search results over it */}
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
          {isSearching && (
            <div className="p-4 sm:p-6">
              <p className="mb-3 text-xs font-medium text-slate-500 dark:text-slate-400" role="status">
                {results.length === 0
                  ? 'No settings match'
                  : `${results.length} ${results.length === 1 ? 'setting matches' : 'settings match'}`}
              </p>
              {results.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                  Try another word, like “dark”, “night”, “calendar”, or “backup”.
                </div>
              ) : (
                <ul id={resultsId} role="listbox" aria-label="Matching settings" className="space-y-1.5">
                  {results.map(({ entry }, index) => {
                    const Icon = SECTION_ICONS[entry.section]
                    const isActive = index === highlighted
                    return (
                      <li
                        key={entry.id}
                        id={resultId(index)}
                        role="option"
                        aria-selected={isActive}
                        onPointerMove={() => setActiveResult(index)}
                        onClick={() => openResult(entry, false)}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                          isActive
                            ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-400/40 dark:bg-indigo-500/10'
                            : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/60'
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">{entry.label}</span>
                            <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
                              {SETTINGS_SECTION_LABELS[entry.section]}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{entry.description}</span>
                        </span>
                        {isActive && (
                          <CornerDownLeft size={14} className="hidden shrink-0 text-indigo-500 sm:block" aria-hidden="true" />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* The section stays mounted while searching, so drafts like a pasted backup survive a search. */}
          <div
            ref={panelRef}
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId(effectiveTab)}
            tabIndex={-1}
            hidden={isSearching}
            className="p-4 outline-none sm:p-6"
          >
            <div className="mb-5 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <ActiveIcon size={18} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{SETTINGS_SECTION_LABELS[effectiveTab]}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{SECTION_DESCRIPTIONS[effectiveTab]}</p>
              </div>
            </div>

            {saveError && (
              <p role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {saveError}
              </p>
            )}
            {jumpHint?.tab === effectiveTab && (
              <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-200">
                <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
                <span>{jumpHint.text}</span>
              </p>
            )}

            {effectiveTab === 'swimlanes' && (
              <LanesTab
                onImportPendingChange={onImportPendingChange}
                editingConfig={editingConfig}
                setEditingConfig={setEditingConfig}
                onOpenPrivacy={onOpenPrivacy}
                onOpenSelfHost={onOpenSelfHost}
              />
            )}

            {effectiveTab === 'display' && (
              <DisplayTab editingConfig={editingConfig} setEditingConfig={setEditingConfig} />
            )}

            {effectiveTab === 'ambient' && (
              <AmbientTab editingConfig={editingConfig} setEditingConfig={setEditingConfig} />
            )}

            {effectiveTab === 'radar' && isRadarSupported && (
              <RadarTab editingConfig={editingConfig} setEditingConfig={setEditingConfig} />
            )}

            {effectiveTab === 'backup' && (
              <BackupTab
                editingConfig={editingConfig}
                setEditingConfig={setEditingConfig}
                onOpenPrivacy={onOpenPrivacy}
                onOpenSelfHost={onOpenSelfHost}
              />
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
