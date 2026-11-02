/* oxlint-disable react/only-export-components */
import { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import { AmbientController } from '../../src/components/ambient/AmbientController'

type Scenario = { enabled: boolean; mounted: boolean; time: string; tomorrowEmpty?: boolean; hasRemainingEvents?: boolean }

declare global {
  interface Window {
    /** Moves the fixture to a new scenario; driven by `ambient-controller.spec.ts`. */
    setAmbientScenario?: (patch: Partial<Scenario>) => void
    /** Wake-listener additions and removals, counted by the spec. */
    ambientListenerCounts?: { added: number; removed: number }
    /** How many times the lock screen was reported shown, so a one-frame flash still counts. */
    ambientShownCount?: number
  }
}

function makeWeather(time: string): HourlyWeatherPoint[] {
  const start = new Date(time)
  start.setMinutes(0, 0, 0)
  return Array.from({ length: 48 }, (_, index) => ({
    time: new Date(start.getTime() + index * 3_600_000).toISOString(),
    temperature: 12 + (index % 4),
    symbol: 'clear-day' as const,
    precipitationMm: index === 2 ? 0.4 : 0,
    precipitationProbability: index === 2 ? 45 : 0,
    windSpeedMs: 3,
  }))
}

let wasShown = false

function Fixture() {
  const [scenario, setScenario] = useState<Scenario>({ enabled: true, mounted: true, time: '2026-09-21T22:30:00+03:00' })
  const [visible, setVisible] = useState(false)
  const handleVisibilityChange = useCallback((isShown: boolean) => {
    if (isShown && !wasShown) window.ambientShownCount = (window.ambientShownCount ?? 0) + 1
    wasShown = isShown
    setVisible(isShown)
  }, [])
  const weather = makeWeather(scenario.time)
  // oxlint-disable-next-line react/immutability -- this fixture intentionally exposes deterministic browser controls.
  window.setAmbientScenario = patch => setScenario(value => ({ ...value, ...patch }))

  return (
    <main>
      <h1>Dashboard ambient controller fixture</h1>
      <output data-testid="ambient-visibility">{String(visible)}</output>
      {scenario.mounted && <AmbientController
        enabled={scenario.enabled}
        startHour={21}
        endHour={7}
        currentTime={new Date(scenario.time)}
        hasRemainingEvents={scenario.hasRemainingEvents ?? true}
        todayWeather={weather}
        tomorrowWeather={scenario.tomorrowEmpty ? [] : weather}
        onVisibilityChange={handleVisibilityChange}
      />}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Fixture />)
