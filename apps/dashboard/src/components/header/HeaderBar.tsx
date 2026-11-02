import React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Settings,
  Maximize2,
  Minimize2,
  Timer,
  Sun,
  Moon,
} from 'lucide-react'
import { Button } from '@simon-lumikello/meanwhile-ui/react'
import { isSameDay, addDays, subDays } from 'date-fns'
import { formatCountdown } from '@dashboard/utils/dateRollover'
import type { ThemeMode } from '@dashboard/features/settings'

interface HeaderBarProps {
  selectedDate: Date
  onSelectDate: (d: Date) => void
  currentTime: Date
  onOpenSettings: () => void
  clock24h?: boolean
  idleSecondsRemaining?: number
  kioskMode?: boolean
  theme?: ThemeMode
  isDark?: boolean
  onToggleTheme?: () => void
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  selectedDate,
  onSelectDate,
  currentTime,
  onOpenSettings,
  clock24h = true,
  idleSecondsRemaining,
  kioskMode = false,
  isDark = true,
  onToggleTheme,
}) => {
  const isSelectedToday = isSameDay(selectedDate, currentTime)
  const isSelectedYesterday = isSameDay(selectedDate, subDays(currentTime, 1))
  const isSelectedTomorrow = isSameDay(selectedDate, addDays(currentTime, 1))

  const pillContainerRef = React.useRef<HTMLDivElement>(null)
  const yesterdayBtnRef = React.useRef<HTMLButtonElement>(null)
  const todayBtnRef = React.useRef<HTMLButtonElement>(null)
  const tomorrowBtnRef = React.useRef<HTMLButtonElement>(null)

  const [pillStyle, setPillStyle] = React.useState<{ left: number; width: number; visible: boolean }>({
    left: 0,
    width: 0,
    visible: false,
  })
  const [isReady, setIsReady] = React.useState(false)

  React.useLayoutEffect(() => {
    const updatePill = () => {
      let targetButton: HTMLButtonElement | null = null
      if (isSelectedYesterday) {
        targetButton = yesterdayBtnRef.current
      } else if (isSelectedToday) {
        targetButton = todayBtnRef.current
      } else if (isSelectedTomorrow) {
        targetButton = tomorrowBtnRef.current
      }

      if (targetButton && pillContainerRef.current) {
        setPillStyle({
          left: targetButton.offsetLeft,
          width: targetButton.offsetWidth,
          visible: true,
        })
      } else {
        setPillStyle(prev => ({
          ...prev,
          visible: false,
        }))
      }
    }

    updatePill()

    const rafId = requestAnimationFrame(() => {
      setIsReady(true)
    })

    let isMounted = true
    window.addEventListener('resize', updatePill)
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        if (isMounted) updatePill()
      })
    }

    return () => {
      isMounted = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updatePill)
    }
  }, [isSelectedYesterday, isSelectedToday, isSelectedTomorrow])

  const [isFullscreen, setIsFullscreen] = React.useState(() => {
    if (typeof document === 'undefined') return false
    return !!document.fullscreenElement
  })

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const isKioskMode =
    isFullscreen ||
    Boolean(kioskMode) ||
    (typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).has('kiosk') ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: standalone)').matches))


  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  // Live hours and minutes; the separator blinks once a second like a digital watch
  const colonVisible = currentTime.getSeconds() % 2 === 0
  const liveClock = new Intl.DateTimeFormat([], {
    hour: clock24h ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: !clock24h,
  })
    .formatToParts(currentTime)
    .map((part, i) =>
      part.type === 'literal' && part.value.trim() === ':' ? (
        <span key={i} aria-hidden="true" className={colonVisible ? 'opacity-100' : 'opacity-30'}>
          :
        </span>
      ) : (
        <React.Fragment key={i}>{part.value}</React.Fragment>
      ),
    )

  // Short date, e.g. "Sat, Sep 5"
  const formatShortDate = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  // Format compact mobile date
  const formattedMobileDate = isSelectedToday
    ? `Today, ${selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : isSelectedYesterday
    ? `Yest, ${selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : isSelectedTomorrow
    ? `Tom, ${selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <header className="h-14 px-3 flex items-center justify-between border-b border-slate-200/80 dark:border-white/10 bg-white/85 dark:bg-slate-950/80 backdrop-blur-xl shrink-0 z-40 transition-colors duration-200">
      {/* DESKTOP Left section: Date Navigation Controls */}
      <div className="hidden md:flex items-center gap-2.5">
        {/* Day step buttons */}
        <div className="h-8 flex items-center gap-0.5 bg-slate-100 dark:bg-slate-900/80 rounded-lg px-0.5 border border-slate-200 dark:border-white/5 shadow-2xs">
          <Button size="sm" variant="ghost" hideLabel onClick={() => onSelectDate(subDays(selectedDate, 1))} icon={<ChevronLeft />}>
            Previous Day
          </Button>
          <Button size="sm" variant="ghost" hideLabel onClick={() => onSelectDate(addDays(selectedDate, 1))} icon={<ChevronRight />}>
            Next Day
          </Button>
        </div>

        {/* Quick Day Switcher Pills with sliding background and color morphing */}
        <div
          ref={pillContainerRef}
          className="relative h-8 flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-lg border border-slate-200 dark:border-white/5"
        >
          {/* Animated sliding pill indicator */}
          <div
            aria-hidden="true"
            className={`absolute top-0.5 bottom-0.5 rounded-md pointer-events-none ${
              isSelectedToday
                ? 'bg-rose-500 shadow-md shadow-rose-500/30'
                : 'bg-white dark:bg-slate-700 shadow-xs'
            }`}
            style={{
              left: 0,
              width: `${pillStyle.width}px`,
              transform: `translateX(${pillStyle.left}px) scale(${pillStyle.visible ? 1 : 0.92})`,
              opacity: pillStyle.visible ? 1 : 0,
              transition: isReady
                ? 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1), width 320ms cubic-bezier(0.16, 1, 0.3, 1), background-color 320ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 320ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease'
                : 'none',
            }}
          />

          <button
            ref={yesterdayBtnRef}
            aria-pressed={isSelectedYesterday}
            onClick={() => onSelectDate(subDays(currentTime, 1))}
            className={`relative z-10 h-7 px-3 flex items-center rounded-md text-xs font-semibold transition-colors duration-200 cursor-pointer ${
              isSelectedYesterday
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Yesterday
          </button>

          <button
            ref={todayBtnRef}
            data-testid="header-today-button"
            aria-pressed={isSelectedToday}
            onClick={() => onSelectDate(currentTime)}
            className={`relative z-10 h-7 px-3 flex items-center rounded-md text-xs font-semibold transition-colors duration-200 cursor-pointer ${
              isSelectedToday
                ? 'text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {formatShortDate(currentTime)}
          </button>

          <button
            ref={tomorrowBtnRef}
            aria-pressed={isSelectedTomorrow}
            onClick={() => onSelectDate(addDays(currentTime, 1))}
            className={`relative z-10 h-7 px-3 flex items-center rounded-md text-xs font-semibold transition-colors duration-200 cursor-pointer ${
              isSelectedTomorrow
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Tomorrow
          </button>
        </div>

        {/* The Today button carries today's date; other dates need their own label */}
        {!isSelectedYesterday && !isSelectedToday && !isSelectedTomorrow && (
          <span
            data-testid="header-date-display"
            className="ml-1.5 shrink-0 text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight whitespace-nowrap"
          >
            {formatShortDate(selectedDate)}
          </span>
        )}

        {/* Digital Clock */}
        <span className="ml-2 text-[20px] lg:text-[24px] leading-none font-extrabold tracking-tight text-slate-800 dark:text-white tabular-numbers font-mono">
          {liveClock}
        </span>

        {/* Back to Today Button - shown ONLY in kiosk mode when browsing other dates, with countdown timer and NO animation */}
        {!isSelectedToday && isKioskMode && (
          <Button
            tone="danger"
            onClick={() => onSelectDate(currentTime)}
            title="Return to Today"
            aria-label="Back to Today"
            icon={<RotateCcw />}
          >
            <span className="hidden lg:inline">Back to Today</span>
            <span className="flex items-center gap-1 ml-0.5 px-1.5 py-0.5 rounded-md bg-black/25 text-[10px] font-mono tabular-numbers text-rose-100 border border-white/10 shrink-0">
              <Timer size={10} className="text-rose-200" />
              <span>{formatCountdown(idleSecondsRemaining)}</span>
            </span>
          </Button>
        )}
      </div>

      {/* MOBILE Left section: Compact Day Stepper & Date */}
      <div className="flex md:hidden items-center gap-1.5 min-w-0">
        <div className="h-8 flex items-center gap-0.5 bg-slate-100 dark:bg-slate-900/80 rounded-lg px-0.5 border border-slate-200 dark:border-white/5 shadow-2xs shrink-0">
          <Button size="sm" variant="ghost" hideLabel onClick={() => onSelectDate(subDays(selectedDate, 1))} icon={<ChevronLeft />}>
            Previous Day
          </Button>
          <Button size="sm" variant="ghost" hideLabel onClick={() => onSelectDate(addDays(selectedDate, 1))} icon={<ChevronRight />}>
            Next Day
          </Button>
        </div>

        {/* Compact Clickable Date Pill */}
        <button
          onClick={() => onSelectDate(currentTime)}
          className={`h-8 px-2 flex items-center gap-1 rounded-lg border text-xs font-bold truncate transition-all cursor-pointer ${
            isSelectedToday
              ? 'bg-slate-100 dark:bg-slate-900/80 text-slate-900 dark:text-white border-slate-200 dark:border-white/10'
              : 'bg-rose-500 text-white border-rose-400/30 shadow-xs'
          }`}
          title={isSelectedToday ? 'Currently viewing today' : 'Tap to return to today'}
        >
          <span className="truncate">{formattedMobileDate}</span>
          {!isSelectedToday && <RotateCcw size={11} className="shrink-0 ml-0.5 opacity-80" />}
        </button>
      </div>

      {/* DESKTOP Right section: Quick Actions as plain icons */}
      <div className="hidden md:flex items-center gap-1">
        {/* Theme Quick-Toggle Button */}
        {onToggleTheme && (
          <Button
            variant="ghost"
            onClick={onToggleTheme}
            title={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
            aria-label="Toggle Theme"
            icon={isDark ? <Sun className="text-amber-400" /> : <Moon className="text-indigo-500" />}
          />
        )}

        {/* Kiosk Fullscreen Toggle */}
        <Button
          variant="ghost"
          onClick={toggleFullscreen}
          title="Toggle Kiosk Fullscreen"
          aria-label="Toggle Kiosk Fullscreen"
          icon={isFullscreen ? <Minimize2 /> : <Maximize2 />}
        />

        {/* Settings Button */}
        <Button variant="ghost" onClick={onOpenSettings} title="Settings" aria-label="Settings" icon={<Settings />} />
      </div>

      {/* MOBILE Right section: Compact Action Icons */}
      <div className="flex md:hidden items-center gap-1 shrink-0">
        {/* Compact Clock (hidden on tiny screens < 360px) */}
        <div className="hidden sm:flex items-center px-1.5">
          <span className="text-xl leading-none font-extrabold tracking-tight text-slate-800 dark:text-white font-mono tabular-numbers">
            {liveClock}
          </span>
        </div>

        {/* Theme Toggle */}
        {onToggleTheme && (
          <Button
            variant="ghost"
            onClick={onToggleTheme}
            title={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
            aria-label="Toggle Theme"
            icon={isDark ? <Sun className="text-amber-400" /> : <Moon className="text-indigo-500" />}
          />
        )}

        {/* Settings Button */}
        <Button variant="ghost" onClick={onOpenSettings} title="Settings" aria-label="Settings" icon={<Settings />} />
      </div>
    </header>
  )
}
