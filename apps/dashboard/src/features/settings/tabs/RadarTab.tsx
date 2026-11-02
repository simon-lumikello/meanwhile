import React from 'react'
import { MapPin } from 'lucide-react'
import type { RadarWidgetSize } from '@simon-lumikello/meanwhile-radar/core'
import type { DashboardConfig, WeatherMapConfig } from '@dashboard/features/settings/types'

interface RadarTabProps {
  editingConfig: DashboardConfig
  setEditingConfig: React.Dispatch<React.SetStateAction<DashboardConfig>>
}

const SIZE_OPTIONS: { id: RadarWidgetSize; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'compact', label: 'Compact' },
]

const ToggleRow: React.FC<{
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}> = ({ title, description, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 py-3 cursor-pointer">
    <div>
      <h5 className="text-xs font-bold text-slate-900 dark:text-white">{title}</h5>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{description}</p>
    </div>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 accent-sky-500 rounded cursor-pointer shrink-0"
    />
  </label>
)

export const RadarTab: React.FC<RadarTabProps> = ({
  editingConfig,
  setEditingConfig,
}) => {
  const weatherMap = editingConfig.weatherMap
  const weatherLane =
    editingConfig.swimlanes.find((l) => l.enabled && l.type === 'weather') ||
    editingConfig.swimlanes.find((l) => l.type === 'weather')
  const locationName = weatherLane?.source.weatherLocation || 'Helsinki'
  const lat = weatherLane?.source.weatherLatitude ?? 60.1699
  const lon = weatherLane?.source.weatherLongitude ?? 24.9384

  const update = (patch: Partial<WeatherMapConfig>) => {
    setEditingConfig((prev) => ({ ...prev, weatherMap: { ...prev.weatherMap, ...patch } }))
  }

  return (
    <div className="space-y-3">
      <div className="px-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
        <ToggleRow
          title="Show on timeline"
          description="A live weather map floating in the corner of the timeline."
          checked={weatherMap.showOnTimeline}
          onChange={(showOnTimeline) => update({ showOnTimeline })}
        />
        <ToggleRow
          title="Show on ambient screen"
          description="A weather map card next to the forecast cards."
          checked={weatherMap.showOnAmbient}
          onChange={(showOnAmbient) => update({ showOnAmbient })}
        />
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <h5 className="text-xs font-bold text-slate-900 dark:text-white">Size</h5>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Compact takes less room on both screens.
            </p>
          </div>
          <div role="group" aria-label="Weather map size" className="flex shrink-0 p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800">
            {SIZE_OPTIONS.map((opt) => {
              const isSelected = weatherMap.size === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => update({ size: opt.id })}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${isSelected
                      ? 'bg-white dark:bg-slate-950 text-sky-700 dark:text-sky-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
        <ToggleRow
          title="Live flight traffic"
          description="Airplanes over the map, from adsb.lol."
          checked={weatherMap.showAirplanes}
          onChange={(showAirplanes) => update({ showAirplanes })}
        />
      </div>

      <p className="flex items-start gap-1.5 px-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        <MapPin size={12} className="shrink-0 mt-0.5" />
        <span>
          Centered on {locationName} ({lat.toFixed(2)}°, {lon.toFixed(2)}°), the weather lane&apos;s location.
          Zoom, clouds or heatmap, and the rain filter are set on the map itself.
        </span>
      </p>
    </div>
  )
}
