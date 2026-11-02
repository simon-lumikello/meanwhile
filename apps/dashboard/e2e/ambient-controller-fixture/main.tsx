/* oxlint-disable react/only-export-components */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import { AmbientController } from '../../src/components/ambient/AmbientController'

type Scenario = { enabled: boolean; mounted: boolean; time: string; tomorrowEmpty?: boolean }

declare global {
  interface Window {
    /** Moves the fixture to a new scenario; driven by `ambient-controller.spec.ts`. */
    setAmbientScenario?: (patch: Partial<Scenario>) => void
    /** Wake-listener additions and removals, counted by the spec. */
    ambientListenerCounts?: { added: number; removed: number }
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

function Fixture() {
  const [scenario, setScenario] = useState<Scenario>({ enabled: true, mounted: true, time: '2026-09-21T22:30:00+03:00' })
  const [visible, setVisible] = useState(false)
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
        hasRemainingEvents
        todayWeather={weather}
        tomorrowWeather={scenario.tomorrowEmpty ? [] : weather}
        onVisibilityChange={setVisible}
      />}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Fixture />)
