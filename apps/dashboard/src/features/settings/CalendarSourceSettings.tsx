import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, SettingsSelect } from '@simon-lumikello/meanwhile-ui/react'
import type { SwimlaneConfig } from './swimlane'
import { MAX_LOCAL_CALENDAR_BYTES, validateLocalCalendar } from '@dashboard/services/localCalendar'

interface CalendarSourceSettingsProps {
  lane: SwimlaneConfig
  onSourceChange: (source: SwimlaneConfig['source']) => void
  onImportPendingChange: (laneId: string, pending: boolean) => void
  onOpenPrivacy: () => void
  onOpenSelfHost?: () => void
}

export function CalendarSourceSettings({ lane, onSourceChange, onImportPendingChange, onOpenPrivacy, onOpenSelfHost }: CalendarSourceSettingsProps) {
  const readerRef = useRef<FileReader | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isReading, setIsReading] = useState(false)
  const laneId = lane.id

  useEffect(() => () => {
    if (readerRef.current) {
      readerRef.current.onload = null
      readerRef.current.onerror = null
      readerRef.current.abort()
    }
    onImportPendingChange(laneId, false)
  }, [laneId, onImportPendingChange])

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    readerRef.current?.abort()
    setError(null)
    if (!/\.ics$/i.test(file.name) || file.size > MAX_LOCAL_CALENDAR_BYTES) {
      setError(file.size > MAX_LOCAL_CALENDAR_BYTES ? 'Choose an .ics file smaller than 1 MB.' : 'Choose a calendar file ending in .ics.')
      setIsReading(false)
      onImportPendingChange(laneId, false)
      return
    }
    const reader = new FileReader()
    readerRef.current = reader
    setIsReading(true)
    onImportPendingChange(laneId, true)
    const finish = () => {
      setIsReading(false)
      onImportPendingChange(laneId, false)
    }
    reader.onload = () => {
      try {
        if (typeof reader.result !== 'string') throw new Error('Could not read this calendar file.')
        validateLocalCalendar(file.name, file.size, reader.result)
        onSourceChange({ ...lane.source, endpoint: '', calendarSource: 'file', localCalendarFile: { name: file.name, content: reader.result } })
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Could not read this calendar file.')
      }
      finish()
    }
    reader.onerror = () => {
      setError('Could not read this calendar file. Please try again.')
      finish()
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-white/5">
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="font-medium text-slate-700 dark:text-slate-300">Calendar source</span>
        <SettingsSelect
          label={`Calendar source for ${lane.title}`}
          value={lane.source.calendarSource || 'url'}
          onChange={(value) => {
            if (value === (lane.source.calendarSource || 'url')) return
            onSourceChange({ ...lane.source, calendarSource: value === 'file' ? 'file' : 'url', endpoint: '', localCalendarFile: undefined })
          }}
          options={[{ value: 'url', label: 'Calendar URL' }, { value: 'file', label: 'Local .ics file' }]}
          className="w-40"
        />
      </div>
      {lane.source.calendarSource === 'file' ? (
        <div className="space-y-2">
          <label htmlFor={`calendar-file-${lane.id}`} className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Import calendar (.ics)
          </label>
          <input ref={fileInputRef} id={`calendar-file-${lane.id}`} type="file" accept=".ics,text/calendar" onChange={handleFile} className="hidden" />
          <Button onClick={() => fileInputRef.current?.click()}>
            {lane.source.localCalendarFile ? 'Replace .ics file' : 'Choose .ics file'}
          </Button>
          <p className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">
            Your calendar stays on this device. The file is read in your browser and saved locally when you press Apply; it is never uploaded, even on the public app.
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Export an .ics file from your calendar app. This is a snapshot: import it again to update events. Maximum file size: 1 MB.
          </p>
          <p role="status" className="text-xs text-slate-600 dark:text-slate-300 break-all">
            {isReading ? 'Reading calendar…' : lane.source.localCalendarFile ? `Selected: ${lane.source.localCalendarFile.name}. Press Apply to save changes.` : 'No file selected. This lane will be empty until you import a calendar.'}
          </p>
          {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          {lane.source.localCalendarFile && <Button variant="ghost" tone="danger" disabled={isReading} onClick={() => onSourceChange({ ...lane.source, localCalendarFile: undefined })}>Remove imported calendar</Button>}
        </div>
      ) : (
        <>
          <label htmlFor={`calendar-url-${lane.id}`} className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
            Calendar iCal URL (.ics)
          </label>
          <input
            id={`calendar-url-${lane.id}`}
            type="url"
            value={lane.source.endpoint}
            onChange={(e) =>
              onSourceChange({ ...lane.source, endpoint: e.target.value })
            }
            placeholder="Paste https://calendar.google.com/.../basic.ics"
            className="w-full bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-lg px-3 py-1.5 border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          />
          <p className="text-[10px] text-slate-500 leading-tight">
            Leave blank to use dynamic demo events. For live sync: Google Calendar →{' '}
            <a
              href="https://calendar.google.com/calendar/r/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium text-slate-700 dark:text-slate-300"
            >
              Settings
            </a>{' '}
            → &quot;Secret address in iCal format&quot;.
          </p>
          {lane.source.endpoint && (
            <p className="text-[10px] leading-tight text-amber-600 dark:text-amber-400/80 flex items-start gap-1">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                This URL passes through our relay server. Choose Local .ics file above to keep calendar data on this device, even on the public app.{' '}
                <button
                  type="button"
                  onClick={onOpenPrivacy}
                  className="underline underline-offset-2 hover:text-amber-500 dark:hover:text-amber-300 cursor-pointer"
                >
                  Privacy details
                </button>
                {' '}·{' '}
                <button
                  type="button"
                  onClick={onOpenSelfHost}
                  className="underline underline-offset-2 hover:text-amber-500 dark:hover:text-amber-300 cursor-pointer"
                >
                  Self-host for full privacy
                </button>
              </span>
            </p>
          )}
        </>
      )}
    </div>
  )
}
