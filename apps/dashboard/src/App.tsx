import { useEffect, useMemo, useState } from 'react'
import { isSameDay } from 'date-fns'
import type { CalendarEvent, PositionedEvent } from '@dashboard/features/timeline'
import { pickDemoCity } from '@dashboard/features/settings'
import { evaluateAuroraVisibility } from '@simon-lumikello/meanwhile-weather/core'
import type { HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import {
  assignEventTracks,
  calculateEventPosition,
  getPlayheadPercent,
  hasRemainingEventsToday,
} from '@dashboard/features/timeline'
import { useIsMobile, useIsPortrait } from '@dashboard/components/ambient/useIsMobile'
import {
  canStepMobileLanes,
  getEffectiveOrientation,
  stepMobileLanes,
  toggleMobileLane,
  toggleMobileLaneCount,
} from '@dashboard/features/timeline'
import { shouldHideTimelineRadar } from '@dashboard/components/ambient/ambientPolicy'
import { useDashboardConfig } from '@dashboard/context'
import { useCalendarEvents } from '@dashboard/hooks/useCalendarQueries'
import { useWeatherForecast, useRainAlert, useRadarRainRate, useAuroraForecast, useDashboardRadarScene, useWeekOutlook } from '@dashboard/hooks/useWeatherQueries'
import { useWallClock } from '@dashboard/hooks/useWallClock'
import { HeaderBar } from '@dashboard/components/header/HeaderBar'
import { TimelineGrid, MobileLaneSelector, EventDetailModal } from '@dashboard/features/timeline'
import { SettingsDrawer } from '@dashboard/features/settings'
import { WeatherRadarOverlay } from '@dashboard/components/weather/WeatherRadarOverlay'
import { AmbientController } from '@dashboard/components/ambient/AmbientController'
import { useThunderstormQuery } from '@simon-lumikello/meanwhile-radar/query'
import { WelcomeDialog } from '@dashboard/components/welcome/WelcomeDialog'
import { PrivacyModal } from '@dashboard/components/privacy/PrivacyModal'
import { SelfHostingModal } from '@dashboard/components/selfhost/SelfHostingModal'
import { GlobalTooltip } from '@dashboard/components/common/GlobalTooltip'

export function App() {
  const { config, saveConfig, updateWeatherMap } = useDashboardConfig()
  const weatherMap = config.weatherMap
  const isMobile = useIsMobile()
  const isPortrait = useIsPortrait()
  const isMobilePortrait = isMobile && isPortrait
  const [mobileLaneCount, setMobileLaneCount] = useState<1 | 2>(1)
  const [mobileSelectedLaneIds, setMobileSelectedLaneIds] = useState<string[]>([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<PositionedEvent | null>(null)
  const [showWelcome, setShowWelcome] = useState<boolean>(() => !config.welcomeSeen)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showSelfHost, setShowSelfHost] = useState(false)
  const [isLockScreenShown, setIsLockScreenShown] = useState(false)

  // The demo city used for weather when no real config is set
  const demoCity = useMemo(() => pickDemoCity(), [])

  // Wall-clock tick, midnight rollover & kiosk idle reset timer
  const { currentTime, selectedDate, idleSecondsRemaining, handleSelectDate } = useWallClock({
    idleResetMinutes: config.idleResetMinutes,
    onResetToToday: () => setSelectedEvent(null),
  })

  // Theme resolution: 'dark' | 'light' | 'system'
  const configTheme = config.theme || 'dark'
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches)
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  const isDark = configTheme === 'dark' || (configTheme === 'system' && systemPrefersDark)

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
      document.documentElement.style.colorScheme = 'dark'
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.style.colorScheme = 'light'
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#090d16' : '#f8fafc')
    }
  }, [isDark])

  const handleToggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark'
    saveConfig({
      ...config,
      theme: nextTheme,
    })
  }

  // 1. Fetch Calendar Feeds (TanStack Query)
  const { calendarEventsByLane, hasLoadedCalendarsOnce } = useCalendarEvents(
    config.swimlanes,
    selectedDate
  )

  // 2. Fetch Weather Data (TanStack Query)
  const activeWeatherLane =
    config.swimlanes.find((l) => l.enabled && l.type === 'weather') ||
    config.swimlanes.find((l) => l.type === 'weather')
  const hasWeatherLane = config.swimlanes.some((l) => l.enabled && l.type === 'weather')

  const {
    todayWeatherPoints,
    tomorrowWeatherPoints,
    weatherPoints,
    weatherLocationName,
    isWeatherLoading,
    coords,
  } = useWeatherForecast(activeWeatherLane, hasWeatherLane, selectedDate, demoCity)

  // 3. Proximity rain alert (TanStack Query)
  const rainAlert = useRainAlert(
    coords,
    todayWeatherPoints,
    activeWeatherLane?.source.showRainAlerts !== false
  )

  // 4. Real-time radar precipitation rate (TanStack Query)
  const { data: radarRainRate } = useRadarRainRate(
    coords.lat,
    coords.lon,
    coords.isRadarSupported
  )

  // 4b. Week outlook for the lock screen, only while it's switched on (TanStack Query)
  const showWeekAhead = config.nightMode.enabled && config.nightMode.showWeekAhead === true
  const weekOutlook = useWeekOutlook(coords, showWeekAhead)

  // 5. Aurora Space Weather Forecast (TanStack Query)
  const auroraAlertsEnabled = config.nightMode.auroraAlerts !== false
  const kpForecast = useAuroraForecast(auroraAlertsEnabled)

  const auroraStatus = useMemo(() => {
    if (!auroraAlertsEnabled || kpForecast.length === 0 || todayWeatherPoints.length === 0) {
      return undefined
    }

    return evaluateAuroraVisibility(
      kpForecast,
      todayWeatherPoints,
      coords.lat,
      coords.lon,
      currentTime,
      tomorrowWeatherPoints
    )
  }, [
    auroraAlertsEnabled,
    kpForecast,
    todayWeatherPoints,
    tomorrowWeatherPoints,
    coords.lat,
    coords.lon,
    currentTime,
  ])

  // 5. Thunderstorm & Lightning Observations (TanStack Query)
  const thunderstormStatus = useThunderstormQuery(coords.lat, coords.lon, coords.isRadarSupported)

  // 6. Calculate Playhead Position Percentage (0 to 100, or null if not today)
  const playheadPercent = useMemo(() => {
    return getPlayheadPercent(currentTime, selectedDate)
  }, [currentTime, selectedDate])
  const radarScene = useDashboardRadarScene(coords.isRadarSupported, weatherMap.showAirplanes)

  // 6. Calculate Positioned, Track-Assigned & Split-Muted Events for all active lanes
  const positionedEventsByLane = useMemo(() => {
    const result: Record<string, PositionedEvent[]> = {}

    for (const [laneId, events] of Object.entries(calendarEventsByLane)) {
      const positionedList: PositionedEvent[] = []
      for (const evt of events) {
        const pos = calculateEventPosition(evt, selectedDate, playheadPercent)
        if (pos) {
          positionedList.push(pos)
        }
      }
      // Assign collision-free tracks so overlapping events never obscure each other
      result[laneId] = assignEventTracks(positionedList)
    }

    return result
  }, [calendarEventsByLane, selectedDate, playheadPercent])

  // Keep selectedEvent synchronized with latest positioned events across clock ticks
  const activeSelectedEvent = useMemo(() => {
    if (!selectedEvent) return null
    const laneEvents = positionedEventsByLane[selectedEvent.swimlaneId]
    return laneEvents?.find((e) => e.id === selectedEvent.id) ?? selectedEvent
  }, [selectedEvent, positionedEventsByLane])

  // 7. Determine if there are remaining events today across enabled calendar lanes
  const hasRemainingEvents = useMemo(() => {
    if (!isSameDay(selectedDate, currentTime)) {
      return true
    }

    // Do not dim during initial fetch before calendars are loaded for the first time
    if (!hasLoadedCalendarsOnce) {
      return true
    }

    const enabledCalendarLaneIds = new Set(
      config.swimlanes
        .filter((l) => l.enabled && l.type === 'google-calendar')
        .map((l) => l.id)
    )

    const allTodayEvents: CalendarEvent[] = []
    for (const [laneId, events] of Object.entries(calendarEventsByLane)) {
      if (enabledCalendarLaneIds.has(laneId)) {
        allTodayEvents.push(...events)
      }
    }

    const graceSeconds =
      config.nightMode.dimAfterLastEventGraceSeconds ??
      (config.nightMode.dimAfterLastEventGraceMinutes ? config.nightMode.dimAfterLastEventGraceMinutes * 60 : 30)

    return hasRemainingEventsToday(allTodayEvents, currentTime, {
      graceSeconds,
      ignoreAllDay: true,
      dimZeroEventDays: true,
    })
  }, [
    selectedDate,
    currentTime,
    config.swimlanes,
    calendarEventsByLane,
    hasLoadedCalendarsOnce,
    config.nightMode.dimAfterLastEventGraceSeconds,
    config.nightMode.dimAfterLastEventGraceMinutes,
  ])

  const activeLanes = useMemo(
    () => config.swimlanes.filter((l) => l.enabled),
    [config.swimlanes]
  )

  // Ensure selectedLaneIds are always valid active lane IDs
  const validSelectedLaneIds = useMemo(() => {
    const valid = mobileSelectedLaneIds.filter((id) =>
      activeLanes.some((l) => l.id === id)
    )
    if (valid.length > 0) {
      if (mobileLaneCount === 1) return [valid[0]]
      return valid.slice(0, 2)
    }
    if (activeLanes.length === 0) return []
    if (mobileLaneCount === 2 && activeLanes.length >= 2) {
      return [activeLanes[0].id, activeLanes[1].id]
    }
    return [activeLanes[0].id]
  }, [mobileSelectedLaneIds, activeLanes, mobileLaneCount])

  const handleToggleMobileLane = (laneId: string) => {
    const next = toggleMobileLane(validSelectedLaneIds, laneId, mobileLaneCount)
    setMobileSelectedLaneIds(next)
  }

  const handleToggleLaneCount = () => {
    const { newCount, newSelectedIds } = toggleMobileLaneCount(
      mobileLaneCount,
      validSelectedLaneIds,
      activeLanes
    )
    setMobileLaneCount(newCount)
    setMobileSelectedLaneIds(newSelectedIds)
  }

  const canPrevLane = useMemo(
    () => canStepMobileLanes(activeLanes, validSelectedLaneIds, 'prev', mobileLaneCount),
    [activeLanes, validSelectedLaneIds, mobileLaneCount]
  )

  const canNextLane = useMemo(
    () => canStepMobileLanes(activeLanes, validSelectedLaneIds, 'next', mobileLaneCount),
    [activeLanes, validSelectedLaneIds, mobileLaneCount]
  )

  const handlePrevLane = () => {
    const next = stepMobileLanes(activeLanes, validSelectedLaneIds, 'prev', mobileLaneCount)
    setMobileSelectedLaneIds(next)
  }

  const handleNextLane = () => {
    const next = stepMobileLanes(activeLanes, validSelectedLaneIds, 'next', mobileLaneCount)
    setMobileSelectedLaneIds(next)
  }

  const handleMobileSwipeLane = (direction: 'left' | 'right') => {
    if (direction === 'right') {
      handleNextLane()
    } else {
      handlePrevLane()
    }
  }

  // Handle welcome dialog dismiss — mark welcomeSeen in config
  const handleWelcomeDismiss = () => {
    setShowWelcome(false)
    saveConfig({ ...config, welcomeSeen: true })
  }

  // On mobile in portrait: lock to vertical flow so time scrolls top-to-bottom and lanes are side-by-side columns.
  // In landscape or on desktop: use user's configured orientation (allowing toggling).
  const effectiveOrientation = getEffectiveOrientation(config.orientation, isMobilePortrait)

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top Header Bar with Day Navigation and Actions */}
      <HeaderBar
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        currentTime={currentTime}
        onOpenSettings={() => setIsSettingsOpen(true)}
        clock24h={config.clock24h}
        idleSecondsRemaining={idleSecondsRemaining}
        kioskMode={config.kioskMode}
        theme={configTheme}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />

      {/* Mobile Lane Selector Tabs & Count Toggle (rendered only on small screens) */}
      <MobileLaneSelector
        swimlanes={activeLanes}
        eventsByLane={positionedEventsByLane}
        selectedLaneIds={validSelectedLaneIds}
        onToggleLane={handleToggleMobileLane}
        laneCount={mobileLaneCount}
        onToggleLaneCount={handleToggleLaneCount}
        onPrevLane={handlePrevLane}
        onNextLane={handleNextLane}
        canPrev={canPrevLane}
        canNext={canNextLane}
        isDark={isDark}
      />

      {/* Main 24-Hour Timeline Grid with Parallel Swimlanes */}
      <TimelineGrid
        swimlanes={config.swimlanes}
        eventsByLane={positionedEventsByLane}
        weatherPoints={weatherPoints}
        isWeatherLoading={isWeatherLoading}
        rainAlert={rainAlert}
        orientation={effectiveOrientation}
        playheadPercent={playheadPercent}
        currentTime={currentTime}
        selectedDate={selectedDate}
        mutePastEvents={config.mutePastEvents}
        clock24h={config.clock24h}
        zebraStriping={config.zebraStriping ?? true}
        gridLineIntensity={config.gridLineIntensity ?? 'medium'}
        isDark={isDark}
        onSelectEvent={setSelectedEvent}
        isMobile={isMobile}
        mobileSelectedLaneIds={validSelectedLaneIds}
        mobileLaneCount={mobileLaneCount}
        onMobileSwipeLane={handleMobileSwipeLane}
      />

      {/* Live Weather Radar Overlay — Prefer past day / smooth jump & fade */}
      {coords.isRadarSupported && activeWeatherLane && weatherMap.showOnTimeline && (() => {
        const curH = currentTime.getHours()
        const curPt = todayWeatherPoints.find((p: HourlyWeatherPoint) => new Date(p.time).getHours() === curH) ?? todayWeatherPoints[0]
        const hasLockScreenRadar = coords.isRadarSupported && weatherMap.showOnAmbient
        const isTimelineRadarHidden = shouldHideTimelineRadar(isLockScreenShown, hasLockScreenRadar)

        return (
          <WeatherRadarOverlay
            // Hide rather than unmount behind Settings: remounting rebuilds the radar and stalls closing the dialog
            hidden={isTimelineRadarHidden || isSettingsOpen}
            latitude={coords.lat}
            longitude={coords.lon}
            isDark={isDark}
            showAirplanes={weatherMap.showAirplanes}
            radarZoom={weatherMap.zoom}
            radarSize={weatherMap.size}
            filterMode={weatherMap.filterMode}
            renderMode={weatherMap.renderMode}
            cloudTransparency={weatherMap.cloudTransparency}
            cloudLighting={weatherMap.cloudLighting}
            windSpeedMs={curPt?.windSpeedMs}
            windGustMs={curPt?.windGustMs}
            windDirectionDeg={curPt?.windDirectionDeg}
            rainRate={radarRainRate}
            radarSource={radarScene.radarSource}
            airplanes={radarScene.airplanes}
            eventsByLane={positionedEventsByLane}
            lanes={activeLanes}
            now={currentTime}
            orientation={effectiveOrientation}
            auroraStatus={auroraStatus}
            thunderstorm={thunderstormStatus}
            onZoomChange={(zoom) => updateWeatherMap({ zoom })}
            onFilterChange={(filterMode) => updateWeatherMap({ filterMode })}
            onRenderModeChange={(renderMode) => updateWeatherMap({ renderMode })}
            onCloudTransparencyChange={(cloudTransparency) => updateWeatherMap({ cloudTransparency })}
            onCloudLightingChange={(cloudLighting) => updateWeatherMap({ cloudLighting })}
          />
        )
      })()}

      {/* Settings Configuration Drawer */}
      <SettingsDrawer
        key={isSettingsOpen ? 'open' : 'closed'}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={(newConfig) => saveConfig(newConfig, { requirePersistence: true })}
        onOpenPrivacy={() => setShowPrivacy(true)}
        onOpenSelfHost={() => setShowSelfHost(true)}
      />

      {/* Event Details Dialog Modal */}
      <EventDetailModal
        event={activeSelectedEvent}
        swimlane={config.swimlanes.find((s) => s.id === activeSelectedEvent?.swimlaneId)}
        clock24h={config.clock24h}
        currentTime={currentTime}
        onClose={() => setSelectedEvent(null)}
      />

      {/* Ambient Night Dimmer */}
      <AmbientController
        enabled={config.nightMode.enabled}
        suppressed={isSettingsOpen || Boolean(selectedEvent) || showPrivacy || showSelfHost || showWelcome}
        startHour={config.nightMode.startHour}
        endHour={config.nightMode.endHour}
        currentTime={currentTime}
        dimAfterLastEvent={config.nightMode.dimAfterLastEvent ?? true}
        hasRemainingEvents={hasRemainingEvents}
        backgroundDim={config.nightMode.backgroundDim}
        cardDim={config.nightMode.cardDim}
        todayWeather={todayWeatherPoints}
        tomorrowWeather={tomorrowWeatherPoints}
        weekForecast={weekOutlook}
        showWeek={showWeekAhead}
        locationName={weatherLocationName}
        clock24h={config.clock24h}
        auroraStatus={auroraStatus}
        thunderstorm={thunderstormStatus}
        showRadarCard={coords.isRadarSupported && weatherMap.showOnAmbient}
        isRadarSupported={coords.isRadarSupported}
        radarFilterMode={weatherMap.filterMode}
        radarRenderMode={weatherMap.renderMode}
        radarCloudTransparency={weatherMap.cloudTransparency}
        radarCloudLighting={weatherMap.cloudLighting}
        showAirplanes={weatherMap.showAirplanes}
        radarZoom={weatherMap.zoom}
        radarSize={weatherMap.size}
        latitude={coords.lat}
        longitude={coords.lon}
        rainRate={radarRainRate}
        radarSource={radarScene.radarSource}
        airplanes={radarScene.airplanes}
        rainAlert={rainAlert}
        onVisibilityChange={setIsLockScreenShown}
      />

      {/* First-Launch Welcome Dialog */}
      {showWelcome && (
        <WelcomeDialog
          isDark={isDark}
          demoCity={demoCity.name}
          onDismiss={handleWelcomeDismiss}
          onOpenPrivacy={() => setShowPrivacy(true)}
          onOpenSelfHost={() => setShowSelfHost(true)}
        />
      )}

      {/* Privacy Policy Modal */}
      <PrivacyModal
        isOpen={showPrivacy}
        onClose={() => setShowPrivacy(false)}
        onOpenSelfHost={() => setShowSelfHost(true)}
        isDark={isDark}
      />

      {/* Self-Hosting Guide Modal */}
      <SelfHostingModal
        isOpen={showSelfHost}
        onClose={() => setShowSelfHost(false)}
        isDark={isDark}
      />

      {/* Global Styled Tooltip for all dashboard controls and badges */}
      <GlobalTooltip isDark={isDark} disabled={isLockScreenShown} />
    </div>
  )
}

export default App
