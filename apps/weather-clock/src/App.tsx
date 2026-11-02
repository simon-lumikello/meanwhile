import { useEffect, useMemo, useState } from 'react'
import { AmbientView } from '@simon-lumikello/meanwhile-ambient/react'
import { RadarViewport } from '@simon-lumikello/meanwhile-radar/react'
import { createFmiRadarFrameSource } from '@simon-lumikello/meanwhile-radar/sources'
import { getWeatherProvider } from '@simon-lumikello/meanwhile-weather/providers'
import { evaluateAuroraVisibility } from '@simon-lumikello/meanwhile-weather/core'
import { useAuroraForecastQuery, useLocationSearchQuery, useWeatherForecastQuery, useWeekForecastQuery } from '@simon-lumikello/meanwhile-weather/query'
import { Settings as SettingsIcon } from 'lucide-react'
import { Button, Dialog, LocationSearch, formatLocationOption } from '@simon-lumikello/meanwhile-ui/react'
import { loadAmbientConfig, saveAmbientConfig, type AmbientConfig } from './storage'

// Whole-coverage FMI frames; the radar requests and refreshes scans itself.
const fmiRadarSource = createFmiRadarFrameSource()
// The Weather Clock is always dark and always forecasts from FMI.
const provider = getWeatherProvider('fmi')

export default function App() {
  const [config, setConfig] = useState(loadAmbientConfig)
  const [now, setNow] = useState(() => new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const update = (patch: Partial<AmbientConfig>) => setConfig(previous => {
    const next = { ...previous, ...patch }
    saveAmbientConfig(next)
    return next
  })
  const apply = (next: AmbientConfig) => {
    saveAmbientConfig(next)
    setConfig(next)
  }
  const forecastConfig = { ...provider.defaultConfig, latitude: config.latitude, longitude: config.longitude, place: config.location }
  const today = useWeatherForecastQuery({ provider, date: now, config: forecastConfig })
  const tomorrow = useWeatherForecastQuery({ provider, date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), config: forecastConfig })
  const kpForecast = useAuroraForecastQuery()
  const auroraStatus = useMemo(() => evaluateAuroraVisibility(
    kpForecast.data ?? [], today.data ?? [], config.latitude, config.longitude, now, tomorrow.data ?? [],
  ), [kpForecast.data, today.data, tomorrow.data, config.latitude, config.longitude, now])
  // The rest of the week after Today and Tomorrow; fetched only while the week is shown.
  const week = useWeekForecastQuery({ provider, startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2), days: 5, config: forecastConfig, enabled: config.showWeek })
  // AmbientView sizes the slot (a weather-row cell, or the space under the cards); the card fills it.
  const radarSlot = config.showRadar ? <section className="ambient-radar h-full" aria-label="Weather map"><RadarViewport className="w-full h-full" latitude={config.latitude} longitude={config.longitude} isDark interactive showControls hasActiveAurora={auroraStatus.isCurrentlyVisible} auroraKp={auroraStatus.currentKp} radarZoom={config.radarZoom} showBasemap={config.showBasemap} mapStyle={config.mapStyle} filterMode={config.filterMode} renderMode={config.renderMode} radarSource={fmiRadarSource} autoRecenterMs={2 * 60 * 1000} onZoomChange={radarZoom => update({ radarZoom })} onFilterChange={filterMode => update({ filterMode })} onRenderModeChange={renderMode => update({ renderMode })} /></section> : undefined
  const state = today.isError || tomorrow.isError ? 'unavailable' : today.isPending || tomorrow.isPending ? 'loading' : 'ready'

  return <main className="ambient-app dark">
    <Button size="lg" variant="ghost" tone="neutral" pill className="fixed top-3 right-3 z-[4]" onClick={() => setSettingsOpen(true)} aria-label="Open Weather Clock settings" title="Settings" icon={<SettingsIcon strokeWidth={1.75} />} />
    {settingsOpen && <Settings config={config} onClose={() => setSettingsOpen(false)} onApply={apply} />}
    <AmbientView currentTime={now} location={config.location} todayWeather={today.data} tomorrowWeather={tomorrow.data} auroraStatus={auroraStatus} weekForecast={week.data} showWeek={config.showWeek} onShowWeekChange={showWeek => update({ showWeek })} forecastState={state} theme="dark" clock24h={config.clock24h} cardDim={config.brightness} radarSlot={radarSlot} />
  </main>
}

/** Edits a draft of the configuration; nothing changes until Apply. */
function Settings({ config: saved, onClose, onApply }: { config: AmbientConfig; onClose: () => void; onApply: (config: AmbientConfig) => void }) {
  const [config, setDraft] = useState(saved)
  const onChange = (patch: Partial<AmbientConfig>) => setDraft(previous => ({ ...previous, ...patch }))
  const [locationQuery, setLocationQuery] = useState('')
  const locationSearch = useLocationSearchQuery({ query: locationQuery, providerId: 'fmi' })

  return <Dialog
    open
    onClose={onClose}
    title="Weather Clock settings"
    closeLabel="Close settings"
    bodyClassName="grid gap-4"
    footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="solid" tone="primary" onClick={() => { onApply(config); onClose() }}>Apply</Button>
    </>}
  >
    <div className="settings-field settings-location-field">
      <span>Location</span>
      <LocationSearch
        label="Search location"
        placeholder="Search for a location"
        value={config.location}
        onSearch={setLocationQuery}
        results={locationSearch.data}
        isLoading={locationSearch.isFetching}
        isError={locationSearch.isError}
        messages={{ searching: 'Searching towns…', error: 'Town search is unavailable. Try again shortly.', empty: 'No towns found. Try a more specific name.' }}
        onSelect={result => onChange({ location: formatLocationOption(result), latitude: result.latitude, longitude: result.longitude })}
      />
    </div>
    <label className="settings-field"><span>Brightness <output>{config.brightness}%</output></span><input className="settings-range" type="range" min="20" max="100" value={config.brightness} onChange={event => onChange({ brightness: Number(event.target.value) })} /></label>
    <div className="settings-toggles">
      <label><input type="checkbox" checked={config.clock24h} onChange={event => onChange({ clock24h: event.target.checked })} /><span><strong>24-hour clock</strong><small>Use 24-hour time on the display.</small></span></label>
      <label><input type="checkbox" checked={config.showRadar} onChange={event => onChange({ showRadar: event.target.checked })} /><span><strong>Show weather map</strong><small>Include a live weather map card when radar coverage is available.</small></span></label>
      <label><input type="checkbox" checked={config.showWeek} onChange={event => onChange({ showWeek: event.target.checked })} /><span><strong>Show the week ahead</strong><small>Add compact cards for the five days after tomorrow. The Week ahead button under the cards switches them too.</small></span></label>
    </div>
  </Dialog>
}
