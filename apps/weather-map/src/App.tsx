import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RadarSettingsFields, RadarViewport } from '@simon-lumikello/meanwhile-radar/react'
import { createFmiRadarFrameSource, isWithinFmiRadarCoverage } from '@simon-lumikello/meanwhile-radar/sources'
import { radarRainRateQueryOptions, radarWindQueryOptions, useAircraftRegionQuery } from '@simon-lumikello/meanwhile-radar/query'
import { evaluateAuroraVisibility } from '@simon-lumikello/meanwhile-weather/core'
import { getWeatherProvider } from '@simon-lumikello/meanwhile-weather/providers'
import { useAuroraForecastQuery, useLocationSearchQuery, useWeatherForecastQuery } from '@simon-lumikello/meanwhile-weather/query'
import { Button, Dialog, LocationSearch, formatLocationOption } from '@simon-lumikello/meanwhile-ui/react'
import { loadRadarConfig, saveRadarConfig, type RadarConfig } from './storage'
import { AIRCRAFT_REGION, AIRCRAFT_RELAY_URL, HAS_AIRCRAFT_RELAY } from './relay'

// Whole-coverage FMI frames; the radar requests and refreshes scans itself.
const fmiRadarSource = createFmiRadarFrameSource()
// Open-Meteo supplies sky conditions worldwide, including beyond FMI radar coverage.
const provider = getWeatherProvider('open-meteo')
const AIRCRAFT_SOURCE = { relayUrl: AIRCRAFT_RELAY_URL }
const roundCoordinate = (value: number) => Math.round(value * 100) / 100

export default function App() {
  const [config, setConfig] = useState(loadRadarConfig)
  const [now, setNow] = useState(() => new Date())
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    const timer = window.setInterval(refresh, 60 * 1000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  const apply = (next: RadarConfig) => {
    saveRadarConfig(next)
    setConfig(next)
  }
  const showAirplanes = config.showAirplanes && HAS_AIRCRAFT_RELAY
  // One shared Finland snapshot, polled every 15 seconds; the radar draws whatever part is in view.
  // Never make aircraft requests follow the map: per-view searches get the upstream to throttle.
  const aircraft = useAircraftRegionQuery(AIRCRAFT_REGION, AIRCRAFT_SOURCE, showAirplanes)
  const available = isWithinFmiRadarCoverage(config.latitude, config.longitude)
  // Current wind (Open-Meteo) and radar rain rate (FMI) at the location, rounded to about a kilometre.
  const readingLatitude = roundCoordinate(config.latitude)
  const readingLongitude = roundCoordinate(config.longitude)
  const wind = useQuery(radarWindQueryOptions(readingLatitude, readingLongitude)).data
  const rainRate = useQuery(radarRainRateQueryOptions(readingLatitude, readingLongitude, available)).data
  const forecastConfig = { ...provider.defaultConfig, latitude: config.latitude, longitude: config.longitude, place: config.location }
  const weather = useWeatherForecastQuery({ provider, date: now, config: forecastConfig })
  const kpForecast = useAuroraForecastQuery()
  const auroraStatus = useMemo(() => evaluateAuroraVisibility(
    kpForecast.data ?? [], weather.data ?? [], config.latitude, config.longitude, now,
  ), [kpForecast.data, weather.data, config.latitude, config.longitude, now])

  return <main className="radar-app dark">
    <RadarViewport
      className="full-radar"
      style={{ width: '100%', height: '100%' }}
      latitude={config.latitude}
      longitude={config.longitude}
      isDark
      interactive
      showControls
      showBasemap
      showAirplanes={showAirplanes}
      airplanes={aircraft.data ?? []}
      radarZoom={config.zoom}
      mapStyle={config.mapStyle}
      filterMode={config.filterMode}
      renderMode={config.renderMode}
      cloudTransparency={config.cloudTransparency}
      cloudLighting={config.cloudLighting}
      radarSource={available ? fmiRadarSource : undefined}
      windSpeedMs={wind?.speedMs}
      windGustMs={wind?.gustMs}
      windDirectionDeg={wind?.directionDeg}
      rainRate={available ? rainRate : undefined}
      hasActiveAurora={auroraStatus.isCurrentlyVisible}
      auroraKp={auroraStatus.currentKp}
      // The map's Settings button opens this app's one dialog, which carries the map's own fields.
      onOpenSettings={() => setOpen(true)}
      topRightSlot={!available ? <p className="unavailable" role="status">FMI radar is unavailable for this location.</p> : undefined}
    />
    {open && <Settings config={config} onClose={() => setOpen(false)} onApply={apply} />}
  </main>
}

/** Edits a draft of the configuration; nothing changes until Apply. */
function Settings({ config, onClose, onApply }: { config: RadarConfig; onClose: () => void; onApply: (config: RadarConfig) => void }) {
  const [draft, setDraft] = useState(config)
  const onChange = (patch: Partial<RadarConfig>) => setDraft(previous => ({ ...previous, ...patch }))
  const [locationQuery, setLocationQuery] = useState('')
  const locationSearch = useLocationSearchQuery({ query: locationQuery })

  return <Dialog
    open
    onClose={onClose}
    title="Weather Map settings"
    closeLabel="Close settings"
    bodyClassName="grid gap-4"
    footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="solid" tone="primary" onClick={() => { onApply(draft); onClose() }}>Apply</Button>
    </>}
  >
    <div className="radar-settings-field">
      <span>Location</span>
      <LocationSearch
        label="Search location"
        placeholder="Search for a location"
        value={draft.location}
        onSearch={setLocationQuery}
        results={locationSearch.data}
        isLoading={locationSearch.isFetching}
        isError={locationSearch.isError}
        onSelect={result => onChange({ location: formatLocationOption(result), latitude: result.latitude, longitude: result.longitude })}
      />
    </div>
    <RadarSettingsFields
      value={{ renderMode: draft.renderMode, filterMode: draft.filterMode, cloudTransparency: draft.cloudTransparency, cloudLighting: draft.cloudLighting }}
      onChange={onChange}
    />
    <div className="radar-settings-toggles">
      <label><input type="checkbox" checked={draft.showAirplanes} disabled={!HAS_AIRCRAFT_RELAY} onChange={event => onChange({ showAirplanes: event.target.checked })} /><span><strong>Aircraft overlay</strong><small>{HAS_AIRCRAFT_RELAY ? 'Show aircraft over Finland from live ADS-B data, relayed by this deployment as one shared snapshot, so no location is sent.' : 'Unavailable: this deployment has no aircraft-data relay configured, so no planes can be shown.'}</small></span></label>
    </div>
  </Dialog>
}
