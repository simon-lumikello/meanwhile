import React from 'react'
import { Moon, Sun, Monitor, Clock, LayoutGrid, MonitorPlay } from 'lucide-react'
import { Button, SettingsSelect } from '@simon-lumikello/meanwhile-ui/react'
import type { DashboardConfig, GridLineIntensity, ThemeMode, TimelineOrientation } from '@dashboard/features/settings/types'

interface DisplayTabProps {
  editingConfig: DashboardConfig
  setEditingConfig: React.Dispatch<React.SetStateAction<DashboardConfig>>
}

export const DisplayTab: React.FC<DisplayTabProps> = ({
  editingConfig,
  setEditingConfig,
}) => {
  return (
    <div className="space-y-6">
      {/* SECTION: Interface Appearance */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Moon size={15} className="text-indigo-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Appearance & Orientation
          </h3>
        </div>

        {/* Theme Setting */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 space-y-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Interface Theme</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose between dark mode, light mode, or automatically match your operating system theme.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            {[
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'system', label: 'System', icon: Monitor },
            ].map(({ id, label, icon: Icon }) => {
              const isSelected = (editingConfig.theme || 'dark') === id
              return (
                <Button
                  key={id}
                  tone={isSelected ? 'primary' : 'neutral'}
                  aria-pressed={isSelected}
                  fullWidth
                  onClick={() =>
                    setEditingConfig((prev) => ({
                      ...prev,
                      theme: id as ThemeMode,
                    }))
                  }
                  icon={<Icon />}
                >
                  {label}
                </Button>
              )
            })}
          </div>
        </div>

        {/* Orientation Setting */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10">
          <div className="pr-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Timeline Orientation</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Switch between horizontal left-to-right or vertical top-to-bottom time flow.
              <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                (Mobile portrait always locks to vertical flow; landscape & desktop can toggle).
              </span>
            </p>
          </div>
          <SettingsSelect
            label="Timeline direction"
            className="w-48 shrink-0"
            value={editingConfig.orientation}
            options={[{ value: 'horizontal', label: 'Horizontal (Default)' }, { value: 'vertical', label: 'Vertical' }]}
            onChange={(value) =>
              setEditingConfig((prev) => ({
                ...prev,
                orientation: value as TimelineOrientation,
              }))
            }
          />
        </div>

        {/* 24h vs 12h clock */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10">
          <div>
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-indigo-500" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">24-Hour Clock Format</h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Display time in 24-hour European format (24:00) instead of 12 AM/PM.
            </p>
          </div>
          <input
            type="checkbox"
            checked={editingConfig.clock24h}
            onChange={(e) =>
              setEditingConfig((prev) => ({
                ...prev,
                clock24h: e.target.checked,
              }))
            }
            className="w-5 h-5 accent-indigo-500 rounded cursor-pointer"
          />
        </div>
      </div>

      {/* SECTION: Canvas & Visual Contrast */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <LayoutGrid size={15} className="text-indigo-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Timeline Canvas & Contrast
          </h3>
        </div>

        {/* Grid Line Contrast */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 space-y-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Grid Line Contrast</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Adjust the intensity of canvas hour marks to match your display contrast and room lighting.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            {(['subtle', 'medium', 'vivid'] as const).map((intensity) => {
              const isSelected = (editingConfig.gridLineIntensity || 'medium') === intensity
              return (
                <Button
                  key={intensity}
                  tone={isSelected ? 'primary' : 'neutral'}
                  aria-pressed={isSelected}
                  fullWidth
                  className="capitalize"
                  onClick={() =>
                    setEditingConfig((prev) => ({
                      ...prev,
                      gridLineIntensity: intensity as GridLineIntensity,
                    }))
                  }
                >
                  {intensity}
                </Button>
              )
            })}
          </div>
        </div>

        {/* Calendar Zebra Striping */}
        <div className="flex items-start justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10">
          <div className="pr-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Calendar Zebra Striping</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Adds subtle alternating background shading to calendars for easier visual tracking across wide screens.
            </p>
          </div>
          <input
            type="checkbox"
            checked={editingConfig.zebraStriping ?? true}
            onChange={(e) =>
              setEditingConfig((prev) => ({
                ...prev,
                zebraStriping: e.target.checked,
              }))
            }
            className="w-5 h-5 accent-indigo-500 rounded cursor-pointer mt-1"
          />
        </div>

        {/* Past Event Muting */}
        <div className="flex items-start justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10">
          <div className="pr-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Mute Past Events</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Dims completed events and elapsed time so current and upcoming activities stand out.
            </p>
          </div>
          <input
            type="checkbox"
            checked={editingConfig.mutePastEvents}
            onChange={(e) =>
              setEditingConfig((prev) => ({
                ...prev,
                mutePastEvents: e.target.checked,
              }))
            }
            className="w-5 h-5 accent-indigo-500 rounded cursor-pointer mt-1"
          />
        </div>
      </div>

      {/* SECTION: Wall Kiosk Display */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <MonitorPlay size={15} className="text-indigo-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Wall Kiosk & Screen Behavior
          </h3>
        </div>

        {/* Kiosk Mode Toggle */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10">
          <div className="pr-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Always-on Kiosk Mode</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              Enables dedicated wall display features, including the auto-reset countdown button. (Also auto-enabled in fullscreen).
            </p>
          </div>
          <input
            type="checkbox"
            checked={editingConfig.kioskMode ?? false}
            onChange={(e) =>
              setEditingConfig((prev) => ({
                ...prev,
                kioskMode: e.target.checked,
              }))
            }
            className="w-5 h-5 accent-indigo-500 rounded cursor-pointer shrink-0"
          />
        </div>

        {/* Kiosk Idle Reset Timer */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Kiosk Auto-Reset to Today</h4>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {editingConfig.idleResetMinutes} min
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            When browsing other dates, automatically returns to &quot;Today&quot; after inactivity so the wall display never gets stuck.
          </p>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={editingConfig.idleResetMinutes}
            onChange={(e) =>
              setEditingConfig((prev) => ({
                ...prev,
                idleResetMinutes: parseInt(e.target.value, 10),
              }))
            }
            className="w-full accent-indigo-500 cursor-pointer"
          />
        </div>
      </div>
    </div>
  )
}
