/* oxlint-disable react/only-export-components */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AmbientView } from '@simon-lumikello/meanwhile-ambient/react'
import { evaluateAuroraVisibility, type HourlyWeatherPoint } from '@simon-lumikello/meanwhile-weather/core'
import '@simon-lumikello/meanwhile-ambient/style.css'

const currentTime = new Date('2026-09-21T22:30:00+03:00')
const showAurora = new URLSearchParams(window.location.search).has('aurora')
const todayWeather: HourlyWeatherPoint[] = [22, 23].map(hour => ({
  time: `2026-09-21T${hour}:00:00+03:00`, temperature: 10, precipitationMm: 0, symbol: 'clear-night',
}))
const auroraStatus = evaluateAuroraVisibility(
  [{ time: currentTime.toISOString(), kp: 6, observed: 'predicted', noaaScale: null }],
  todayWeather, 60.1695, 24.9354, currentTime,
)

function AmbientFixture() {
  const [slotInteractions, setSlotInteractions] = useState(0)
  return (
    <main data-testid="ambient-host" style={{ minHeight: '120vh', padding: 24 }}>
      <h1>Ambient package fixture</h1>
      <p>This fixture has no dashboard configuration, query provider, or network feeds.</p>
      <output data-testid="slot-interactions">{slotInteractions}</output>
      <AmbientView currentTime={currentTime} location="Otaniemi" theme="dark" forecastState={showAurora ? 'ready' : 'loading'} todayWeather={showAurora ? todayWeather : undefined} auroraStatus={showAurora ? auroraStatus : undefined} />
      <AmbientView
        currentTime={currentTime}
        location="Helsinki"
        theme="light"
        forecastState="unavailable"
        radarSlot={<button type="button" onClick={() => setSlotInteractions(value => value + 1)}>Radar slot action</button>}
      />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<AmbientFixture />)
