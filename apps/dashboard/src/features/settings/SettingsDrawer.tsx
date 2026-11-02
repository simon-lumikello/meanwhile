import React, { useCallback, useState } from 'react'
import { Button, Dialog } from '@simon-lumikello/meanwhile-ui/react'
import {
  Layers,
  Monitor,
  Moon,
  MapIcon,
  HardDrive,
  ShieldCheck,
} from 'lucide-react'
import type { DashboardConfig } from './types'
import { isDashboardRadarEligible } from '@dashboard/services/radar/radarEligibility'
import { PRESET_COLORS, AVAILABLE_ICONS } from './settingsConstants'
import { LanesTab } from './tabs/LanesTab'
import { DisplayTab } from './tabs/DisplayTab'
import { AmbientTab } from './tabs/AmbientTab'
import { RadarTab } from './tabs/RadarTab'
import { BackupTab } from './tabs/BackupTab'

export { PRESET_COLORS, AVAILABLE_ICONS }

export type SettingsTab = 'swimlanes' | 'display' | 'ambient' | 'radar' | 'backup'

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  config: DashboardConfig
  onSaveConfig: (cfg: DashboardConfig) => void
  onOpenPrivacy: () => void
  onOpenSelfHost?: () => void
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onOpenPrivacy,
  onOpenSelfHost,
}) => {
  const [pendingCalendarImports, setPendingCalendarImports] = useState<Set<string>>(() => new Set())
  const [saveError, setSaveError] = useState<string | null>(null)
  const onImportPendingChange = useCallback((laneId: string, pending: boolean) => {
    setPendingCalendarImports((prev) => {
      if (prev.has(laneId) === pending) return prev
      const next = new Set(prev)
      if (pending) next.add(laneId)
      else next.delete(laneId)
      return next
    })
  }, [])
  const [activeTab, setActiveTab] = useState<SettingsTab>('swimlanes')
  const [editingConfig, setEditingConfig] = useState<DashboardConfig>(config)

  const activeWeatherLane =
    editingConfig.swimlanes.find((l) => l.enabled && l.type === 'weather') ||
    editingConfig.swimlanes.find((l) => l.type === 'weather')
  const weatherProviderId = activeWeatherLane?.source.weatherProviderId || 'open-meteo'
  const weatherLat = activeWeatherLane?.source.weatherLatitude
  const weatherLon = activeWeatherLane?.source.weatherLongitude
  const isRadarSupported = isDashboardRadarEligible(weatherProviderId, weatherLat, weatherLon)

  // If radar is not supported, effectively fall back to 'swimlanes'
  const effectiveTab: SettingsTab =
    activeTab === 'radar' && !isRadarSupported ? 'swimlanes' : activeTab

  const handleSave = () => {
    try {
      onSaveConfig(editingConfig)
      onClose()
    } catch {
      setSaveError('Could not save settings to this browser. Storage may be full or unavailable. Remove an imported calendar or use a smaller file, then try Apply again.')
    }
  }

  const TABS: { id: SettingsTab; label: string; icon: React.FC<{ size?: number; className?: string }>; badge?: number }[] = [
    { id: 'swimlanes', label: 'Lanes', icon: Layers, badge: editingConfig.swimlanes.length },
    { id: 'display', label: 'Display', icon: Monitor },
    { id: 'ambient', label: 'Ambient', icon: Moon },
    ...(isRadarSupported ? [{ id: 'radar' as const, label: 'Weather Map', icon: MapIcon }] : []),
    { id: 'backup', label: 'Backup', icon: HardDrive },
  ]

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      placement="end"
      size="lg"
      title="Dashboard Settings"
      closeLabel="Close Settings"
      flush
      footer={
        <>
          {/* Privacy link */}
          <Button
            id="settings-privacy-link"
            variant="ghost"
            tone="neutral"
            onClick={onOpenPrivacy}
            icon={<ShieldCheck />}
            className="mr-auto"
          >
            Privacy & Data
          </Button>
          <Button variant="ghost" tone="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="solid" tone="primary" onClick={handleSave} disabled={pendingCalendarImports.size > 0}>
            Apply
          </Button>
        </>
      }
    >
      {saveError && <p role="alert" className="px-6 py-3 text-xs text-rose-600 dark:text-rose-400">{saveError}</p>}
      {/* Tab switcher */}
      <div className="sticky top-0 z-10 flex border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900 px-3 sm:px-6 overflow-x-auto no-scrollbar gap-1 sm:gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isSelected = effectiveTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={isSelected}
              className={`py-3 px-3 sm:px-4 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 flex items-center gap-1.5 whitespace-nowrap ${
                isSelected
                  ? 'border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              <Icon size={14} className={isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'opacity-70'} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected
                      ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Body Content */}
      <div className="p-4 sm:p-6">
        {effectiveTab === 'swimlanes' && (
          <LanesTab
            onImportPendingChange={onImportPendingChange}
            editingConfig={editingConfig}
            setEditingConfig={setEditingConfig}
            onOpenPrivacy={onOpenPrivacy}
            onOpenSelfHost={onOpenSelfHost}
          />
        )}

        {effectiveTab === 'display' && (
          <DisplayTab
            editingConfig={editingConfig}
            setEditingConfig={setEditingConfig}
          />
        )}

        {effectiveTab === 'ambient' && (
          <AmbientTab
            editingConfig={editingConfig}
            setEditingConfig={setEditingConfig}
          />
        )}

        {effectiveTab === 'radar' && isRadarSupported && (
          <RadarTab
            editingConfig={editingConfig}
            setEditingConfig={setEditingConfig}
          />
        )}

        {effectiveTab === 'backup' && (
          <BackupTab
            editingConfig={editingConfig}
            setEditingConfig={setEditingConfig}
            onOpenPrivacy={onOpenPrivacy}
            onOpenSelfHost={onOpenSelfHost}
          />
        )}
      </div>
    </Dialog>
  )
}
