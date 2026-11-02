import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RadarViewport } from '@simon-lumikello/meanwhile-radar/react'
import { latLonToWebMercator, type AirplaneData, type RadarCloudTransparency, type RadarFilterMode, type RadarFrameSource, type RadarRenderMode, type RadarZoomLevel } from '@simon-lumikello/meanwhile-radar/core'
import { createFmiRadarFrameSource } from '@simon-lumikello/meanwhile-radar/sources'
import '@simon-lumikello/meanwhile-radar/style.css'

const frame = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="500"%3E%3Crect width="100%25" height="100%25" fill="%230c2438"/%3E%3Ccircle cx="390" cy="260" r="130" fill="%2322c55e" fill-opacity=".4"/%3E%3Ccircle cx="520" cy="170" r="85" fill="%2338bdf8" fill-opacity=".55"/%3E%3C/svg%3E'
// The fixture frame covers ±60 km (EPSG:3857) around the fixture location. `?live` uses real FMI frames and basemap tiles.
const center = latLonToWebMercator(60.1695, 24.9354)
const fixtureSource: RadarFrameSource = {
  id: 'fixture',
  extent3857: [center.x - 96000, center.y - 60000, center.x + 96000, center.y + 60000],
  frameUrl: () => frame,
  attribution: 'Fixture radar',
}
const isLive = new URLSearchParams(window.location.search).has('live')
const source = isLive ? createFmiRadarFrameSource() : fixtureSource
const timestamps = ['2026-09-21T09:40:00.000Z', '2026-09-21T09:45:00.000Z', '2026-09-21T09:50:00.000Z']
const airplanes: AirplaneData[] = [{ icao24: 'fixture1', callsign: 'TEST1', originCountry: 'FI', latitude: 60.18, longitude: 24.95, altitude: 4_500, velocity: 120, trueTrack: 90, category: 4, lastContact: 1_700_000_000 }]

export function RadarFixture() {
  const [zoom] = useState<RadarZoomLevel>('close')
  const [filter, setFilter] = useState<RadarFilterMode>('clouds')
  // Heatmap by default: procedural clouds on CI's software WebGL are too slow for interaction tests.
  // `?renderer=clouds` opts in; cloud rendering itself is covered by the visual suite.
  const [renderMode, setRenderMode] = useState<RadarRenderMode>(new URLSearchParams(window.location.search).get('renderer') === 'clouds' ? 'realistic-clouds' : 'radar-blocks')
  const [cloudTransparency, setCloudTransparency] = useState<RadarCloudTransparency>('solid')
  const [expanded, setExpanded] = useState(false)

  return <main>
    <h1>Radar package fixture</h1>
    <p>This fixture has no dashboard configuration, query provider, or network feeds.</p>
    <button type="button" onClick={() => setExpanded(value => !value)}>Resize viewport</button>
    <output data-testid="radar-state">{`${zoom}|${filter}|${renderMode}|${cloudTransparency}|${expanded ? 'wide' : 'embedded'}`}</output>
    <section data-testid="radar-host" style={{ width: expanded ? 760 : 420, height: expanded ? 460 : 280 }}>
      <RadarViewport
        latitude={60.1695}
        longitude={24.9354}
        interactive
        showControls
        showBasemap={isLive}
        showAirplanes
        radarSource={source}
        airplanes={airplanes}
        windSpeedMs={6}
        windGustMs={9}
        windDirectionDeg={225}
        rainRate={1.2}
        radarZoom={zoom}
        filterMode={filter}
        renderMode={renderMode}
        timelineTimestamps={isLive ? undefined : timestamps}
        forecastMinutes={60}
        onFilterChange={setFilter}
        onRenderModeChange={setRenderMode}
        cloudTransparency={cloudTransparency}
        onCloudTransparencyChange={setCloudTransparency}
      />
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<RadarFixture />)
