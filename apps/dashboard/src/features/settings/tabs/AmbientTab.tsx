import React from 'react'
import { Moon, Clock, Sparkles, Sliders } from 'lucide-react'
import { SettingsSelect } from '@simon-lumikello/meanwhile-ui/react'
import type { DashboardConfig } from '@dashboard/features/settings/types'

interface AmbientTabProps {
  editingConfig: DashboardConfig
  setEditingConfig: React.Dispatch<React.SetStateAction<DashboardConfig>>
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function formatHour(h: number, clock24h: boolean): string {
  if (clock24h) {
    return `${String(h).padStart(2, '0')}:00`
  }
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:00 ${period}`
}

export const AmbientTab: React.FC<AmbientTabProps> = ({
  editingConfig,
  setEditingConfig,
}) => {
  const clock24h = editingConfig.clock24h

  return (
    <div className="space-y-6">
      {/* Ambient Night Dimmer Main Card */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
              <Moon size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Ambient Night Dimmer</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Dims the display to reduce screen wear and avoid lighting up the room during night hours.
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={editingConfig.nightMode.enabled}
            onChange={(e) =>
              setEditingConfig((prev) => ({
                ...prev,
                nightMode: { ...prev.nightMode, enabled: e.target.checked },
              }))
            }
            className="w-5 h-5 accent-indigo-500 rounded cursor-pointer shrink-0"
          />
        </div>

        {editingConfig.nightMode.enabled && (
          <>
            {/* Schedule Section */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/5 space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-500" />
                <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                  Night Dimming Schedule
                </h5>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-white dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-white/10 space-y-1">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                    Starts at night
                  </label>
                  <SettingsSelect
                    label="Starts at night"
                    value={String(editingConfig.nightMode.startHour)}
                    options={HOURS.map(h => ({ value: String(h), label: formatHour(h, clock24h) }))}
                    onChange={(value) =>
                      setEditingConfig((prev) => ({
                        ...prev,
                        nightMode: {
                          ...prev.nightMode,
                          startHour: parseInt(value, 10),
                        },
                      }))
                    }
                  />
                </div>

                <div className="bg-white dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-white/10 space-y-1">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                    Wakes in morning
                  </label>
                  <SettingsSelect
                    label="Wakes in morning"
                    value={String(editingConfig.nightMode.endHour)}
                    options={HOURS.map(h => ({ value: String(h), label: formatHour(h, clock24h) }))}
                    onChange={(value) =>
                      setEditingConfig((prev) => ({
                        ...prev,
                        nightMode: {
                          ...prev.nightMode,
                          endHour: parseInt(value, 10),
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Event Conclusion Trigger */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/5 flex items-center justify-between">
              <div className="pr-4">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                  Show weather when events conclude
                </h5>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Displays weather cards and wall clock once all activities for today are complete. Dims automatically during night hours.
                </p>
              </div>
              <input
                type="checkbox"
                checked={editingConfig.nightMode.dimAfterLastEvent ?? true}
                onChange={(e) =>
                  setEditingConfig((prev) => ({
                    ...prev,
                    nightMode: {
                      ...prev.nightMode,
                      dimAfterLastEvent: e.target.checked,
                    },
                  }))
                }
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer shrink-0"
              />
            </div>

            {/* Week Ahead Cards */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/5 flex items-center justify-between">
              <div className="pr-4">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                  Show the week ahead
                </h5>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Adds compact cards for the five days after tomorrow under the Today and Tomorrow forecasts.
                </p>
              </div>
              <input
                type="checkbox"
                aria-label="Show the week ahead"
                checked={editingConfig.nightMode.showWeekAhead ?? false}
                onChange={(e) =>
                  setEditingConfig((prev) => ({
                    ...prev,
                    nightMode: {
                      ...prev.nightMode,
                      showWeekAhead: e.target.checked,
                    },
                  }))
                }
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer shrink-0"
              />
            </div>

            {/* Brightness Sliders */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/5 space-y-4">
              <div className="flex items-center gap-1.5">
                <Sliders size={14} className="text-indigo-500" />
                <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                  Nocturnal Dimming Levels
                </h5>
              </div>

              {/* Background Dim Level Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Lock Screen Background Darkness
                  </span>
                  <span className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {editingConfig.nightMode.backgroundDim ?? 80}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Darkness level of the opaque lock screen background when dimmed at night (blends toward pure black).
                </p>
                <input
                  type="range"
                  min="40"
                  max="95"
                  step="5"
                  value={editingConfig.nightMode.backgroundDim ?? 80}
                  onChange={(e) =>
                    setEditingConfig((prev) => ({
                      ...prev,
                      nightMode: {
                        ...prev.nightMode,
                        backgroundDim: parseInt(e.target.value, 10),
                      },
                    }))
                  }
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              {/* Screen Content Dim Level / Opacity Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Cards & Clock Visibility
                  </span>
                  <span className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {editingConfig.nightMode.cardDim ?? 70}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Adjust how low-key the clock, date, and weather cards appear during night dimming (always 100% during daytime).
                </p>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="5"
                  value={editingConfig.nightMode.cardDim ?? 70}
                  onChange={(e) =>
                    setEditingConfig((prev) => ({
                      ...prev,
                      nightMode: {
                        ...prev.nightMode,
                        cardDim: parseInt(e.target.value, 10),
                      },
                    }))
                  }
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Aurora Borealis Detection Toggle */}
            <div className="pt-3 border-t border-slate-200 dark:border-white/5 flex items-center justify-between">
              <div className="pr-4">
                <div className="flex items-center gap-1.5">
                  <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                    Aurora Borealis Alerts
                  </h5>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-0.5">
                    <Sparkles size={10} />
                    <span>NOAA</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Highlights the dimmed screen with an ambient Northern Lights glow when space weather (Kp) and clear night skies align.
                </p>
              </div>
              <input
                type="checkbox"
                checked={editingConfig.nightMode.auroraAlerts ?? true}
                onChange={(e) =>
                  setEditingConfig((prev) => ({
                    ...prev,
                    nightMode: {
                      ...prev.nightMode,
                      auroraAlerts: e.target.checked,
                    },
                  }))
                }
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer shrink-0"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
