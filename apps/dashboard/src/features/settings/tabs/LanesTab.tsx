import React, { useState } from 'react'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  CloudSun,
  MapPin,
  LocateFixed,
  RefreshCw,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { CalendarSourceSettings } from '@dashboard/features/settings/CalendarSourceSettings'
import type { DashboardConfig } from '@dashboard/features/settings/types'
import type { SwimlaneConfig, SwimlaneType } from '@dashboard/features/settings/swimlane'
import { detectUserLocation, WEATHER_PROVIDERS } from '@simon-lumikello/meanwhile-weather/providers'
import { isDashboardRadarEligible } from '@dashboard/services/radar/radarEligibility'
import { createDefaultWeatherLane, createDefaultCalendarLane, pickDemoCity } from '@dashboard/features/settings/defaultConfig'
import { IconRenderer } from '@dashboard/components/common/IconRenderer'
import { Button, SettingsSelect } from '@simon-lumikello/meanwhile-ui/react'
import { PlaceAutocomplete, type GeocodingResult } from '@dashboard/features/settings/PlaceAutocomplete'
import { PRESET_COLORS, AVAILABLE_ICONS } from '@dashboard/features/settings/settingsConstants'

interface LanesTabProps {
  editingConfig: DashboardConfig
  setEditingConfig: React.Dispatch<React.SetStateAction<DashboardConfig>>
  onImportPendingChange: (laneId: string, pending: boolean) => void
  onOpenPrivacy: () => void
  onOpenSelfHost?: () => void
}

const toggleLabel = (lane: SwimlaneConfig) =>
  `${lane.enabled ? 'Hide' : 'Show'} ${lane.type === 'weather' ? 'weather' : 'calendar'} lane`

export const LanesTab: React.FC<LanesTabProps> = ({
  editingConfig,
  setEditingConfig,
  onImportPendingChange,
  onOpenPrivacy,
  onOpenSelfHost,
}) => {
  const [openIconPickerLaneId, setOpenIconPickerLaneId] = useState<string | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)

  const handleSwitchToManual = (lane: SwimlaneConfig) => {
    setDetectError(null)
    const restored = lane.source.manualLocation || {
      name: lane.source.weatherLocation || 'Helsinki',
      latitude: lane.source.weatherLatitude ?? 60.1699,
      longitude: lane.source.weatherLongitude ?? 24.9384,
    }
    updateSwimlane(lane.id, {
      source: {
        ...lane.source,
        weatherLocationMode: 'manual',
        weatherLocation: restored.name,
        weatherLatitude: restored.latitude,
        weatherLongitude: restored.longitude,
        manualLocation: restored,
      },
    })
  }

  const handleAutoDetect = async (lane: SwimlaneConfig) => {
    setIsDetecting(true)
    setDetectError(null)
    const currentManual = lane.source.manualLocation || {
      name: lane.source.weatherLocation || 'Helsinki',
      latitude: lane.source.weatherLatitude ?? 60.1699,
      longitude: lane.source.weatherLongitude ?? 24.9384,
    }

    try {
      const detected = await detectUserLocation()
      updateSwimlane(lane.id, {
        source: {
          ...lane.source,
          weatherLocationMode: 'auto',
          weatherLocation: detected.name,
          weatherLatitude: detected.latitude,
          weatherLongitude: detected.longitude,
          manualLocation: currentManual,
          autoLocation: {
            name: detected.name,
            latitude: detected.latitude,
            longitude: detected.longitude,
            method: detected.method,
          },
        },
      })
    } catch (error: unknown) {
      setDetectError(error instanceof Error ? error.message : 'Could not detect location')
    } finally {
      setIsDetecting(false)
    }
  }

  const handleSwitchToAuto = (lane: SwimlaneConfig) => {
    if (lane.source.autoLocation) {
      updateSwimlane(lane.id, {
        source: {
          ...lane.source,
          weatherLocationMode: 'auto',
          weatherLocation: lane.source.autoLocation.name,
          weatherLatitude: lane.source.autoLocation.latitude,
          weatherLongitude: lane.source.autoLocation.longitude,
        },
      })
    }
    handleAutoDetect(lane)
  }

  const updateSwimlane = (id: string, partial: Partial<SwimlaneConfig>) => {
    setEditingConfig((prev) => ({
      ...prev,
      swimlanes: prev.swimlanes.map((l) => (l.id === id ? { ...l, ...partial } : l)),
    }))
  }

  const toggleSwimlaneEnabled = (id: string) => {
    setEditingConfig((prev) => ({
      ...prev,
      swimlanes: prev.swimlanes.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)),
    }))
  }

  const moveSwimlane = (index: number, direction: 'up' | 'down') => {
    const lanes = [...editingConfig.swimlanes]
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= lanes.length) return
    const [moved] = lanes.splice(index, 1)
    lanes.splice(targetIdx, 0, moved)
    setEditingConfig((prev) => ({ ...prev, swimlanes: lanes }))
  }

  const deleteSwimlane = (id: string) => {
    setEditingConfig((prev) => ({
      ...prev,
      swimlanes: prev.swimlanes.filter((l) => l.id !== id),
    }))
  }

  const addSwimlane = () => {
    const newLane = createDefaultCalendarLane(editingConfig.swimlanes.length)
    setEditingConfig((prev) => ({
      ...prev,
      swimlanes: [...prev.swimlanes, newLane],
    }))
  }

  const addWeatherLane = () => {
    const newLane = createDefaultWeatherLane()
    setEditingConfig((prev) => ({
      ...prev,
      swimlanes: [newLane, ...prev.swimlanes],
    }))
  }

  const hasWeatherLane = editingConfig.swimlanes.some((l) => l.type === 'weather')

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure family calendar feeds, custom colors, and weather providers.
        </p>
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {!hasWeatherLane && (
            <Button variant="soft" tone="sky" onClick={addWeatherLane} title="Add Weather lane" icon={<CloudSun />}>
              Add Weather
            </Button>
          )}
          <Button tone="primary" onClick={addSwimlane} icon={<Plus />}>
            Add Calendar
          </Button>
        </div>
      </div>

      {editingConfig.swimlanes.length === 0 ? (
        <div className="py-12 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 text-center flex flex-col items-center justify-center gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No lanes configured. Add a calendar or weather lane to get started.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="soft" tone="sky" onClick={addWeatherLane} icon={<CloudSun />}>
              Add Weather
            </Button>
            <Button tone="primary" onClick={addSwimlane} icon={<Plus />}>
              Add Calendar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {editingConfig.swimlanes.map((lane, idx) => (
            <div
              key={lane.id}
              className={`rounded-2xl border p-4 transition-all ${
                lane.enabled
                  ? 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/10 shadow-xs'
                  : 'bg-slate-100/60 dark:bg-slate-900/20 border-slate-200/60 dark:border-white/5 opacity-60'
              }`}
            >
              {/* Header line */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Icon picker dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenIconPickerLaneId((prev) => (prev === lane.id ? null : lane.id))
                      }
                      className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer shadow-xs transition-transform hover:scale-105 active:scale-95"
                      style={{
                        backgroundColor: lane.colorScheme.secondary,
                        color: lane.colorScheme.primary,
                      }}
                      title="Change icon"
                    >
                      <IconRenderer name={lane.icon} size={16} />
                    </button>

                    {/* Quick icon selector popover */}
                    {openIconPickerLaneId === lane.id && (
                      <>
                        <div
                          className="fixed inset-0 z-20"
                          onClick={() => setOpenIconPickerLaneId(null)}
                        />
                        <div className="w-56 p-2.5 absolute top-10 left-0 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/15 rounded-xl shadow-2xl backdrop-blur-xl grid grid-cols-4 gap-1.5">
                          {AVAILABLE_ICONS.map((ic) => (
                            <button
                              key={ic}
                              type="button"
                              onClick={() => {
                                updateSwimlane(lane.id, { icon: ic })
                                setOpenIconPickerLaneId(null)
                              }}
                              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                lane.icon === ic
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                              }`}
                              title={ic}
                            >
                              <IconRenderer name={ic} size={16} />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <input
                    type="text"
                    value={lane.title}
                    onChange={(e) => updateSwimlane(lane.id, { title: e.target.value })}
                    className="bg-transparent font-bold text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-2 py-0.5 w-full"
                  />
                </div>

                {/* Reorder and Toggle Controls */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => moveSwimlane(idx, 'up')}
                    disabled={idx === 0}
                    title="Move Up"
                    aria-label="Move Up"
                    icon={<ChevronUp />}
                  />
                  <Button
                    variant="ghost"
                    onClick={() => moveSwimlane(idx, 'down')}
                    disabled={idx === editingConfig.swimlanes.length - 1}
                    title="Move Down"
                    aria-label="Move Down"
                    icon={<ChevronDown />}
                  />
                  <Button
                    variant="ghost"
                    onClick={() => toggleSwimlaneEnabled(lane.id)}
                    title={toggleLabel(lane)}
                    aria-label={toggleLabel(lane)}
                    icon={lane.enabled ? <Eye className="text-emerald-500 dark:text-emerald-400" /> : <EyeOff />}
                  />
                  <Button
                    variant="ghost"
                    tone="danger"
                    onClick={() => deleteSwimlane(lane.id)}
                    title={lane.type === 'weather' ? 'Delete weather lane' : 'Delete calendar lane'}
                    aria-label={lane.type === 'weather' ? 'Delete weather lane' : 'Delete calendar lane'}
                    icon={<Trash2 />}
                  />
                </div>
              </div>

              {/* Color Palette Presets */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">Color:</span>
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.primary}
                    onClick={() => updateSwimlane(lane.id, { colorScheme: preset })}
                    className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                      lane.colorScheme.primary === preset.primary
                        ? 'scale-125 ring-2 ring-indigo-500 dark:ring-white'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: preset.primary }}
                    title={preset.label}
                  />
                ))}
              </div>

              {/* Lane Type Selection */}
              <div className="flex items-center justify-between text-xs pt-2.5 mb-2 border-t border-slate-200/80 dark:border-white/5">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Lane Type</span>
                <SettingsSelect
                  label="Lane type"
                  value={lane.type}
                  onChange={(value) => {
                    const newType = value as SwimlaneType
                    if (newType === 'weather') {
                      const defaultCity = pickDemoCity()
                      updateSwimlane(lane.id, {
                        type: 'weather',
                        title: lane.title === 'New Member' ? 'Weather' : lane.title,
                        icon: lane.icon === 'User' ? 'CloudSun' : lane.icon,
                        colorScheme:
                          lane.colorScheme.primary === '#3b82f6'
                            ? {
                                primary: '#38bdf8',
                                secondary: 'rgba(56, 189, 248, 0.12)',
                                accent: '#7dd3fc',
                                text: '#f0f9ff',
                              }
                            : lane.colorScheme,
                        source: {
                          ...lane.source,
                          weatherProviderId: lane.source.weatherProviderId || 'open-meteo',
                          weatherLocation: lane.source.weatherLocation || defaultCity.name,
                          weatherLatitude: lane.source.weatherLatitude ?? defaultCity.latitude,
                          weatherLongitude: lane.source.weatherLongitude ?? defaultCity.longitude,
                          weatherLocationMode: lane.source.weatherLocationMode || 'manual',
                          refreshIntervalMinutes: 15,
                        },
                      })
                    } else {
                      updateSwimlane(lane.id, {
                        type: 'google-calendar',
                        title: lane.title === 'Weather' ? 'New Member' : lane.title,
                        icon: lane.icon === 'CloudSun' ? 'User' : lane.icon,
                        source: {
                          ...lane.source,
                          endpoint: lane.source.endpoint || '',
                          refreshIntervalMinutes: 5,
                        },
                      })
                    }
                  }}
                  className="w-40"
                  options={[
                    { value: 'google-calendar', label: 'Calendar' },
                    { value: 'weather', label: `Weather${hasWeatherLane && lane.type !== 'weather' ? ' (Already active)' : ''}`, disabled: hasWeatherLane && lane.type !== 'weather' },
                  ]}
                />
              </div>

              {/* Data Source Configuration */}
              {lane.type === 'weather' ? (
                <div className="space-y-2 pt-2 border-t border-slate-200/40 dark:border-white/5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">Weather Provider</span>
                      <SettingsSelect
                        label="Weather provider"
                        value={lane.source.weatherProviderId || 'open-meteo'}
                        onChange={(value) =>
                          updateSwimlane(lane.id, {
                            source: {
                              ...lane.source,
                              weatherProviderId: value,
                            },
                          })
                        }
                        className="w-36"
                        options={Object.values(WEATHER_PROVIDERS).map(provider => ({ value: provider.id, label: provider.name }))}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      {(lane.source.weatherProviderId || 'open-meteo') === 'fmi' ? (
                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                          Includes high-res forecast, Doppler radar & rain alerts for Finland
                        </span>
                      ) : (
                        <span>Worldwide forecasts (Doppler radar not available)</span>
                      )}
                    </div>
                  </div>

                  {/* Location Mode & Selection */}
                  <div className="space-y-2 pt-2 border-t border-slate-200/40 dark:border-white/5">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-700 dark:text-slate-300 font-medium">Location Mode</span>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Hand-pick a city or auto-detect via GPS & network
                        </p>
                      </div>

                      {/* Segmented Switch */}
                      <div className="flex p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg border border-slate-300/60 dark:border-white/10 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSwitchToManual(lane)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                            (lane.source.weatherLocationMode || 'manual') === 'manual'
                              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <MapPin size={11} className={(lane.source.weatherLocationMode || 'manual') === 'manual' ? 'text-indigo-500' : ''} />
                          <span>Hand-picked</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSwitchToAuto(lane)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                            lane.source.weatherLocationMode === 'auto'
                              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <LocateFixed size={11} className={lane.source.weatherLocationMode === 'auto' ? 'text-sky-500' : ''} />
                          <span>Auto-detected</span>
                        </button>
                      </div>
                    </div>

                    {/* Hand-picked / Manual UI */}
                    {(lane.source.weatherLocationMode || 'manual') === 'manual' ? (
                      <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/70 dark:border-white/5">
                        <div>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">Place / Municipality</span>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            Search any city, town, or municipality
                          </p>
                        </div>
                        <PlaceAutocomplete
                          value={lane.source.weatherLocation || 'Helsinki'}
                          providerId={lane.source.weatherProviderId}
                          onSelect={(result: GeocodingResult) =>
                            updateSwimlane(lane.id, {
                              source: {
                                ...lane.source,
                                weatherLocation: result.name,
                                weatherLatitude: result.latitude,
                                weatherLongitude: result.longitude,
                                manualLocation: {
                                  name: result.name,
                                  latitude: result.latitude,
                                  longitude: result.longitude,
                                },
                              },
                            })
                          }
                        />
                      </div>
                    ) : (
                      /* Automatically Detected UI */
                      <div className="bg-sky-500/5 dark:bg-sky-500/10 p-2.5 rounded-xl border border-sky-500/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                              <LocateFixed size={14} />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                  {lane.source.weatherLocation || 'Detecting location…'}
                                </span>
                                {lane.source.autoLocation?.method && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider bg-sky-500/20 text-sky-700 dark:text-sky-300">
                                    {lane.source.autoLocation.method === 'gps' ? 'GPS' : 'Network IP'}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                {lane.source.weatherLatitude !== undefined && lane.source.weatherLongitude !== undefined
                                  ? `${lane.source.weatherLatitude.toFixed(2)}° N, ${lane.source.weatherLongitude.toFixed(2)}° E`
                                  : 'Coordinates pending'}
                              </p>
                            </div>
                          </div>

                          <Button
                            variant="soft"
                            tone="sky"
                            disabled={isDetecting}
                            onClick={() => handleAutoDetect(lane)}
                            title="Re-query device and network location"
                            icon={isDetecting ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          >
                            {isDetecting ? 'Detecting…' : 'Re-detect'}
                          </Button>
                        </div>

                        {detectError && (
                          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] flex items-start gap-1.5">
                            <AlertCircle size={13} className="shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <span>{detectError}</span>
                              <button
                                type="button"
                                onClick={() => handleSwitchToManual(lane)}
                                className="underline ml-1 font-semibold hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer"
                              >
                                Switch to hand-picked
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {(() => {
                    const laneProvider = lane.source.weatherProviderId || 'open-meteo'
                    const laneLat = lane.source.weatherLatitude
                    const laneLon = lane.source.weatherLongitude
                    const isRadarSupportedForLane = isDashboardRadarEligible(laneProvider, laneLat, laneLon)

                    return (
                      <>
                        {/* Precipitation Proximity Alerts Toggle */}
                        <div className={`flex items-center justify-between text-xs pt-1 border-t border-slate-200/40 dark:border-white/5 ${!isRadarSupportedForLane ? 'opacity-60' : ''}`}>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-700 dark:text-slate-300 font-medium">Precipitation Alerts</span>
                              {!isRadarSupportedForLane && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium border border-amber-500/20">
                                  FMI only
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {isRadarSupportedForLane
                                ? 'Detect incoming rain or snow within 15 km'
                                : laneProvider !== 'fmi'
                                  ? 'Requires FMI weather provider for real-time radar nowcasting'
                                  : 'Selected location is outside FMI Finnish radar coverage'}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            disabled={!isRadarSupportedForLane}
                            checked={isRadarSupportedForLane && lane.source.showRainAlerts !== false}
                            onChange={(e) =>
                              updateSwimlane(lane.id, {
                                source: {
                                  ...lane.source,
                                  showRainAlerts: e.target.checked,
                                },
                              })
                            }
                            className="w-4 h-4 accent-indigo-500 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </div>
                      </>
                    )
                  })()}
                </div>
              ) : (
                <CalendarSourceSettings
                  key={`${lane.id}:${lane.source.calendarSource || 'url'}`}
                  lane={lane}
                  onSourceChange={(source) => setEditingConfig((prev) => ({
                    ...prev,
                    swimlanes: prev.swimlanes.map((current) => current.id === lane.id ? { ...current, source } : current),
                  }))}
                  onImportPendingChange={onImportPendingChange}
                  onOpenPrivacy={onOpenPrivacy}
                  onOpenSelfHost={onOpenSelfHost}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
