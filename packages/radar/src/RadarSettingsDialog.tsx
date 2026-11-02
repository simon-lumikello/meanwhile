import React, { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Activity, Blend, Cloud, CloudDrizzle, CloudRain, Droplet, Settings as SettingsIcon, Sun, Sunset } from 'lucide-react'
import { Button, Dialog } from '@simon-lumikello/meanwhile-ui/react'
import type { RadarCloudLighting, RadarCloudTransparency, RadarFilterMode, RadarRenderMode } from './types'

/** The overlay choices the settings dialog edits together. */
export interface RadarOverlaySettings {
  renderMode: RadarRenderMode
  filterMode: RadarFilterMode
  cloudTransparency: RadarCloudTransparency
  cloudLighting: RadarCloudLighting
}

export interface RadarSettingsDialogProps {
  isDark: boolean
  settings: RadarOverlaySettings
  showRenderMode: boolean
  showFilter: boolean
  showCloudTransparency: boolean
  showCloudLighting: boolean
  onApply: (next: RadarOverlaySettings) => void
  onClose: () => void
}

interface Choice<T extends string> {
  value: T
  label: string
  icon: React.ReactNode
}

const RENDER_MODE_CHOICES: Choice<RadarRenderMode>[] = [
  { value: 'realistic-clouds', label: 'Realistic clouds', icon: <Cloud className="text-sky-500 dark:text-sky-300" /> },
  { value: 'radar-blocks', label: 'Heatmap', icon: <Activity className="text-amber-500 dark:text-amber-300" /> },
]
const FILTER_CHOICES: Choice<RadarFilterMode>[] = [
  { value: 'clouds', label: 'All clouds', icon: <CloudDrizzle className="text-purple-500 dark:text-purple-300" /> },
  { value: 'rain', label: 'Rain only', icon: <CloudRain className="text-sky-500 dark:text-sky-300" /> },
]
const TRANSPARENCY_CHOICES: Choice<RadarCloudTransparency>[] = [
  { value: 'solid', label: 'Solid', icon: <Cloud className="text-slate-500 dark:text-slate-300" /> },
  { value: 'sheer', label: 'Sheer', icon: <Blend className="text-slate-500 dark:text-slate-300" /> },
  { value: 'see-through', label: 'See-through', icon: <Droplet className="text-slate-500 dark:text-slate-300" /> },
]
const LIGHTING_CHOICES: Choice<RadarCloudLighting>[] = [
  { value: 'time-of-day', label: 'Time of day', icon: <Sunset className="text-orange-500 dark:text-orange-300" /> },
  { value: 'noon', label: 'Noon', icon: <Sun className="text-amber-500 dark:text-amber-300" /> },
]

interface ChoiceGroupProps<T extends string> {
  legend: string
  hint: string
  choices: Choice<T>[]
  value: T
  onChange: (next: T) => void
  disabled?: boolean
}

/** A row of mutually exclusive choices, built on native radios for keyboard and screen reader support. */
function ChoiceGroup<T extends string>({ legend, hint, choices, value, onChange, disabled = false }: ChoiceGroupProps<T>) {
  const name = useId()
  return (
    <fieldset disabled={disabled} className="min-w-0 disabled:opacity-45">
      <legend className="text-xs font-bold text-slate-900 dark:text-white">{legend}</legend>
      <p className="mt-0.5 mb-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
      <div className="flex gap-2">
        {choices.map(choice => {
          const selected = choice.value === value
          return (
            <label
              key={choice.value}
              className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-400/70 [&>svg]:size-3.5 [&>svg]:shrink-0 ${
                disabled ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                selected
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:border-sky-400/60 dark:bg-sky-500/15 dark:text-sky-100'
                  : `border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300 ${disabled ? '' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`
              }`}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={selected}
                onChange={() => onChange(choice.value)}
                className="sr-only"
              />
              {choice.icon}
              <span>{choice.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export interface RadarSettingsFieldsProps {
  /** The draft being edited; the host owns it and saves it on its own Apply. */
  value: RadarOverlaySettings
  onChange: (next: RadarOverlaySettings) => void
  showRenderMode?: boolean
  showFilter?: boolean
  showCloudTransparency?: boolean
  showCloudLighting?: boolean
}

/**
 * The map's overlay choices as plain form sections (renderer, which clouds, and the
 * realistic clouds' transparency and lighting), with no dialog around them. A host puts
 * them in its own settings dialog beside its own fields, edits one draft, and saves it
 * with one Apply; pair it with `RadarViewport`'s `onOpenSettings`. Returns sibling
 * fieldsets, so the host's dialog body lays them out.
 */
export function RadarSettingsFields({
  value,
  onChange,
  showRenderMode = true,
  showFilter = true,
  showCloudTransparency = true,
  showCloudLighting = true,
}: RadarSettingsFieldsProps) {
  const update = <K extends keyof RadarOverlaySettings>(key: K, next: RadarOverlaySettings[K]) =>
    onChange({ ...value, [key]: next })
  const isHeatmap = value.renderMode !== 'realistic-clouds'

  return (
    <>
      {showRenderMode && (
        <ChoiceGroup
          legend="Style"
          hint="Draw the radar as realistic clouds or as a rain intensity heatmap."
          choices={RENDER_MODE_CHOICES}
          value={value.renderMode}
          onChange={next => update('renderMode', next)}
        />
      )}
      {showFilter && (
        <ChoiceGroup
          legend="Clouds"
          hint="Show every cloud, or only the ones bringing rain."
          choices={FILTER_CHOICES}
          value={value.filterMode}
          onChange={next => update('filterMode', next)}
        />
      )}
      {showCloudTransparency && (
        <ChoiceGroup
          legend="Transparency"
          hint={isHeatmap ? 'Applies to realistic clouds only.' : 'How much of the map shows through the clouds.'}
          choices={TRANSPARENCY_CHOICES}
          value={value.cloudTransparency}
          onChange={next => update('cloudTransparency', next)}
          disabled={isHeatmap}
        />
      )}
      {showCloudLighting && (
        <ChoiceGroup
          legend="Lighting"
          hint={isHeatmap ? 'Applies to realistic clouds only.' : 'Follow the sun, with sunrise and sunset colours, or keep the clouds lit as at midday.'}
          choices={LIGHTING_CHOICES}
          value={value.cloudLighting}
          onChange={next => update('cloudLighting', next)}
          disabled={isHeatmap}
        />
      )}
    </>
  )
}

/**
 * The map's own settings dialog, for hosts without a settings dialog of their own: the
 * overlay fields on a draft that only **Apply** saves. It is portalled to the document
 * body so it covers the whole page rather than the map's own stacking context, and
 * carries the map's theme with it.
 */
export function RadarSettingsDialog({
  isDark,
  settings,
  showRenderMode,
  showFilter,
  showCloudTransparency,
  showCloudLighting,
  onApply,
  onClose,
}: RadarSettingsDialogProps) {
  const [draft, setDraft] = useState<RadarOverlaySettings>(settings)

  return createPortal(
    <div className={isDark ? 'dark' : undefined}>
      <Dialog
        open
        onClose={onClose}
        size="sm"
        title="Map settings"
        icon={<SettingsIcon className="size-5 text-indigo-500 dark:text-sky-300" />}
        closeLabel="Close map settings"
        footer={
          <>
            <Button variant="ghost" tone="neutral" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="solid" tone="primary" onClick={() => onApply(draft)}>
              Apply
            </Button>
          </>
        }
        bodyClassName="flex flex-col gap-5"
      >
        <RadarSettingsFields
          value={draft}
          onChange={setDraft}
          showRenderMode={showRenderMode}
          showFilter={showFilter}
          showCloudTransparency={showCloudTransparency}
          showCloudLighting={showCloudLighting}
        />
      </Dialog>
    </div>,
    document.body,
  )
}
