import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuroraVisibilityStatus, DailyOutlook, HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import { calculateRestOfTodayForecast, calculateTomorrowForecast } from '@simon-lumikello/meanwhile-weather/core'
import { AmbientView } from '@simon-lumikello/meanwhile-ambient/react'
import { calculateAmbientBackground, calculateWeekOutlookHeight, weekOutlookRowAllowance } from '@simon-lumikello/meanwhile-ambient/core'
import type {
  AirplaneData,
  RadarCloudLighting,
  RadarCloudTransparency,
  RadarFilterMode,
  RadarFrameSource,
  RadarRenderMode,
  RadarWidgetSize,
  RadarZoomLevel,
  RainProximityAlert,
  ThunderstormStatus,
} from '@simon-lumikello/meanwhile-radar/core'
import { AmbientRadarCard } from './AmbientRadarCard'
import { useIsWideAndShortScreen } from './useIsMobile'
import {
  calculateDashboardAmbientState,
  shouldHandleDashboardWake,
  shouldListenForDashboardWake,
  shouldMountDashboardAmbient,
} from './ambientPolicy'

const AWAKE_MS = 30_000
// After the dashboard loads, and each time the ambient screen becomes eligible again (night hours
// start, the last event ends, the user steps back to today), it waits this long without any
// interaction, so it never appears under someone using the dashboard and flashes at the next mouse move.
const ENTRY_GRACE_MS = 30_000
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'pointerdown'] as const

export interface AmbientControllerProps {
  enabled: boolean
  /** A dialog is open: keep the dashboard awake and the lock screen hidden. */
  suppressed?: boolean
  startHour: number
  endHour: number
  currentTime: Date
  dimAfterLastEvent?: boolean
  hasRemainingEvents?: boolean
  backgroundDim?: number
  cardDim?: number
  todayWeather?: HourlyWeatherPoint[]
  tomorrowWeather?: HourlyWeatherPoint[]
  /** Days after tomorrow for the week outlook row. */
  weekForecast?: DailyOutlook[]
  showWeek?: boolean
  locationName?: string
  clock24h?: boolean
  auroraStatus?: AuroraVisibilityStatus
  thunderstorm?: ThunderstormStatus
  showRadarCard?: boolean
  isRadarSupported?: boolean
  radarFilterMode?: RadarFilterMode
  radarRenderMode?: RadarRenderMode
  radarCloudTransparency?: RadarCloudTransparency
  radarCloudLighting?: RadarCloudLighting
  showAirplanes?: boolean
  radarZoom?: RadarZoomLevel
  radarSize?: RadarWidgetSize
  latitude?: number
  longitude?: number
  rainRate?: number | null
  radarSource?: RadarFrameSource
  airplanes?: AirplaneData[]
  rainAlert?: RainProximityAlert | null
  onVisibilityChange?: (isShown: boolean) => void
}

export function AmbientController({
  enabled,
  suppressed = false,
  startHour,
  endHour,
  currentTime,
  dimAfterLastEvent = true,
  hasRemainingEvents = true,
  backgroundDim = 80,
  cardDim = 70,
  todayWeather = [],
  tomorrowWeather = [],
  weekForecast,
  showWeek = false,
  locationName,
  clock24h = true,
  auroraStatus,
  thunderstorm,
  showRadarCard = true,
  isRadarSupported = false,
  radarFilterMode = 'clouds',
  radarRenderMode = 'realistic-clouds',
  radarCloudTransparency,
  radarCloudLighting,
  showAirplanes = true,
  radarZoom = 'close',
  radarSize = 'standard',
  latitude,
  longitude,
  rainRate,
  radarSource,
  airplanes,
  rainAlert,
  onVisibilityChange,
}: AmbientControllerProps) {
  const [rawIsTemporarilyAwake, setRawIsTemporarilyAwake] = useState(false)
  const [rawIsExiting, setRawIsExiting] = useState(false)
  const [isCardGateOpen, setIsCardGateOpen] = useState(false)
  const [isEntryGraceOver, setIsEntryGraceOver] = useState(false)
  const awakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isWakingRef = useRef(false)
  // The ambient layout raises its in-row radar threshold by the same allowance while the week row takes room below the cards.
  const weekOutlookHeight = calculateWeekOutlookHeight({ isWeekShown: showWeek && Boolean(weekForecast?.length), hasWeekToggle: false })
  const isRadarInRow = useIsWideAndShortScreen(1500, 1100 + weekOutlookRowAllowance(weekOutlookHeight, 1500))

  // An open dialog keeps the dashboard awake instead of disabling ambient mode: disabling it reset the wake
  // state, so closing the dialog showed the lock screen for an instant before the next mouse move woke it.
  if (suppressed && !rawIsTemporarilyAwake) setRawIsTemporarilyAwake(true)

  const initialState = calculateDashboardAmbientState({ enabled, startHour, endHour, currentTime, dimAfterLastEvent, hasRemainingEvents })

  // Re-arm the entry grace during render, not in an effect: an effect would first commit a render that shows the screen.
  // The rest of this render still runs (and its state updates, like the card gate's, still apply), so it uses the re-armed value.
  const [wasEligible, setWasEligible] = useState(initialState.isEligibleToShow)
  const becameEligible = initialState.isEligibleToShow && !wasEligible
  if (initialState.isEligibleToShow !== wasEligible) {
    setWasEligible(initialState.isEligibleToShow)
    if (becameEligible) setIsEntryGraceOver(false)
  }
  const isGraceOver = isEntryGraceOver && !becameEligible

  const isWokenByUser = rawIsTemporarilyAwake && initialState.isEligibleToShow
  const isTemporarilyAwake = (rawIsTemporarilyAwake || suppressed || !isGraceOver) && initialState.isEligibleToShow
  const isExiting = rawIsExiting && initialState.isEligibleToShow
  const ambientState = calculateDashboardAmbientState({ enabled, startHour, endHour, currentTime, dimAfterLastEvent, hasRemainingEvents, isTemporarilyAwake })

  const currentMinute = useMemo(() => new Date(Math.floor(currentTime.getTime() / 60_000) * 60_000), [currentTime])
  const cardsReady = Boolean(
    calculateRestOfTodayForecast(todayWeather, currentMinute) && calculateTomorrowForecast(tomorrowWeather),
  )

  // Once the cards have been ready (or the wait timed out), the gate stays open until the user wakes the
  // dashboard or ambient eligibility ends. At midnight the forecast queries move to the new dates and are
  // briefly empty; closing the gate then would unmount the lock screen and flash the timeline (issue #83).
  if (ambientState.shouldShow && cardsReady && !isCardGateOpen) setIsCardGateOpen(true)

  useEffect(() => {
    if (!ambientState.shouldShow || cardsReady || isCardGateOpen) return
    const timer = setTimeout(() => setIsCardGateOpen(true), 1200)
    return () => clearTimeout(timer)
  }, [ambientState.shouldShow, cardsReady, isCardGateOpen])

  const isMounted = ambientState.isEligibleToShow && shouldMountDashboardAmbient(
    ambientState.shouldShow,
    cardsReady || isCardGateOpen,
    isExiting,
  )
  const isLockScreenShown = Boolean(isMounted && !isExiting)

  const resetAwakeTimer = useCallback(() => {
    if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current)
    awakeTimeoutRef.current = setTimeout(() => setRawIsTemporarilyAwake(false), AWAKE_MS)
  }, [])

  useEffect(() => {
    if (isEntryGraceOver || !initialState.isEligibleToShow) return
    let timer = setTimeout(() => setIsEntryGraceOver(true), ENTRY_GRACE_MS)
    const onActivity = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setIsEntryGraceOver(true), ENTRY_GRACE_MS)
    }
    ACTIVITY_EVENTS.forEach(type => window.addEventListener(type, onActivity, { passive: true }))
    return () => {
      clearTimeout(timer)
      ACTIVITY_EVENTS.forEach(type => window.removeEventListener(type, onActivity))
    }
  }, [isEntryGraceOver, initialState.isEligibleToShow])

  const handleWake = useCallback(() => {
    if (!shouldHandleDashboardWake(ambientState.isEligibleToShow, isLockScreenShown, isWakingRef.current)) return
    isWakingRef.current = true
    setRawIsExiting(true)
    resetAwakeTimer()
    if (wakeTransitionTimerRef.current) clearTimeout(wakeTransitionTimerRef.current)
    wakeTransitionTimerRef.current = setTimeout(() => {
      setRawIsTemporarilyAwake(true)
      setRawIsExiting(false)
      isWakingRef.current = false
      setIsCardGateOpen(false)
    }, 300)
  }, [ambientState.isEligibleToShow, isLockScreenShown, resetAwakeTimer])

  useEffect(() => {
    if (!isWokenByUser) return
    resetAwakeTimer()
    const onActivity = () => resetAwakeTimer()
    window.addEventListener('mousemove', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity, { passive: true })
    window.addEventListener('touchstart', onActivity, { passive: true })
    window.addEventListener('pointerdown', onActivity, { passive: true })
    return () => {
      if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current)
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('touchstart', onActivity)
      window.removeEventListener('pointerdown', onActivity)
    }
  }, [isWokenByUser, resetAwakeTimer])

  const canWake = shouldListenForDashboardWake(ambientState.isEligibleToShow, isLockScreenShown)
  useEffect(() => {
    if (!canWake) return
    window.addEventListener('mousemove', handleWake, { passive: true })
    window.addEventListener('keydown', handleWake, { passive: true })
    window.addEventListener('touchstart', handleWake, { passive: true })
    window.addEventListener('pointerdown', handleWake, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handleWake)
      window.removeEventListener('keydown', handleWake)
      window.removeEventListener('touchstart', handleWake)
      window.removeEventListener('pointerdown', handleWake)
    }
  }, [canWake, handleWake])

  useEffect(() => {
    if (ambientState.isEligibleToShow) return
    if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current)
    if (wakeTransitionTimerRef.current) clearTimeout(wakeTransitionTimerRef.current)
    awakeTimeoutRef.current = null
    wakeTransitionTimerRef.current = null
    isWakingRef.current = false
    const resetTimer = setTimeout(() => {
      setRawIsTemporarilyAwake(false)
      setRawIsExiting(false)
      setIsCardGateOpen(false)
    }, 0)
    return () => clearTimeout(resetTimer)
  }, [ambientState.isEligibleToShow])

  useEffect(() => {
    onVisibilityChange?.(isLockScreenShown)
    return () => onVisibilityChange?.(false)
  }, [isLockScreenShown, onVisibilityChange])

  useEffect(() => () => {
    if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current)
    if (wakeTransitionTimerRef.current) clearTimeout(wakeTransitionTimerRef.current)
  }, [])

  if (!isMounted) return null
  const currentWeather = todayWeather.find(point => new Date(point.time).getHours() === currentTime.getHours()) ?? todayWeather[0]
  const radarSlot = showRadarCard && isRadarSupported && latitude !== undefined && longitude !== undefined
    ? <AmbientRadarCard
        latitude={latitude}
        longitude={longitude}
        clock24h={clock24h}
        filterMode={radarFilterMode}
        renderMode={radarRenderMode}
        cloudTransparency={radarCloudTransparency}
        cloudLighting={radarCloudLighting}
        showAirplanes={showAirplanes}
        zoom={radarZoom}
        radarSize={radarSize}
        inRow={isRadarInRow}
        windSpeedMs={currentWeather?.windSpeedMs}
        windGustMs={currentWeather?.windGustMs}
        windDirectionDeg={currentWeather?.windDirectionDeg}
        rainRate={rainRate}
        radarSource={radarSource}
        airplanes={airplanes}
        auroraStatus={auroraStatus}
        thunderstorm={thunderstorm}
      />
    : undefined

  return (
    <div
      data-testid="dashboard-ambient-controller"
      onClick={handleWake}
      className={`fixed inset-0 z-50 select-none overflow-y-auto ${isExiting ? 'animate-dimmer-fade-out pointer-events-none' : 'animate-dimmer-fade-in !cursor-none [&_*]:!cursor-none'}`}
      style={{ backgroundColor: calculateAmbientBackground(ambientState.isDimmed, backgroundDim) }}
    >
      <AmbientView
        currentTime={currentTime}
        location={locationName}
        isDimmed={ambientState.isDimmed}
        cardDim={cardDim}
        todayWeather={todayWeather}
        tomorrowWeather={tomorrowWeather}
        weekForecast={weekForecast}
        showWeek={showWeek}
        clock24h={clock24h}
        auroraStatus={auroraStatus}
        rainAlert={rainAlert}
        radarSlot={radarSlot}
      />
      <div className="w-full flex items-end justify-center pb-2 md:pb-4 text-center">
        <p className="text-[11px] font-medium uppercase tracking-widest text-slate-400/60">Touch or move mouse to wake</p>
      </div>
    </div>
  )
}
