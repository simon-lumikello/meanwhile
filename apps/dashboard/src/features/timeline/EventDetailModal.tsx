import React, { useEffect } from 'react'
import { Button, Dialog, buttonClassName } from '@simon-lumikello/meanwhile-ui/react'
import { X, Clock, MapPin, AlignLeft, CheckCircle2, Sparkles, Calendar as CalendarIcon, ExternalLink } from 'lucide-react'
import type { PositionedEvent } from './calendar'
import type { SwimlaneConfig } from '@dashboard/features/settings'
import { IconRenderer } from '@dashboard/components/common/IconRenderer'
import { getGoogleMapsUrl } from './maps'
import { formatEventTimeRange } from './eventTimeLabel'

interface EventDetailModalProps {
  event: PositionedEvent | null
  swimlane?: SwimlaneConfig
  clock24h?: boolean
  currentTime?: Date
  isDark?: boolean
  onClose: () => void
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  swimlane,
  clock24h = true,
  currentTime,
  onClose,
}) => {
  // Live tick if currentTime prop is not supplied externally and modal is open
  const [, setTick] = React.useState(0)
  useEffect(() => {
    if (!event || currentTime) return
    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [event, currentTime])

  if (!event) return null

  const formatTime = (d: Date) => {
    return clock24h
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const durationMinutes = Math.round(
    (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000
  )
  const durationHours = Math.floor(durationMinutes / 60)
  const remMinutes = durationMinutes % 60
  const durationStr = event.isAllDay
    ? 'All Day'
    : durationHours > 0
    ? `${durationHours}h${remMinutes > 0 ? ` ${remMinutes}m` : ''}`
    : `${remMinutes}m`

  const dateStr = new Date(event.start).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const renderFormattedDescription = (desc: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = desc.split(urlRegex)

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        )
      }
      return part
    })
  }

  const primaryColor = swimlane?.colorScheme.primary || '#6366f1'

  // Derive live status relative to current time so badge & progress percentage update in real-time
  const now = (currentTime || new Date()).getTime()
  const startMs = new Date(event.start).getTime()
  const endMs = new Date(event.end).getTime()
  const totalDuration = endMs - startMs

  const isPast = event.isAllDay ? event.isPast : now >= endMs
  const isFuture = event.isAllDay ? event.isFuture : now < startMs
  const isInProgress = event.isAllDay ? event.isInProgress : (now >= startMs && now < endMs)
  const progressFraction = isInProgress && totalDuration > 0
    ? Math.min(1, Math.max(0, (now - startMs) / totalDuration))
    : (event.progressFraction ?? 0)
  const progressPercent = Math.round(progressFraction * 100)

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="event-detail-title"
      showCloseButton={false}
      flush
      style={{
        boxShadow: `0 0 40px ${primaryColor}22`,
        borderLeft: `4px solid ${primaryColor}`,
      }}
    >
      <div className="p-4 sm:p-6">
        {/* Header Bar */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {swimlane && (
              <div
                className="p-2 rounded-xl flex items-center justify-center shadow-sm"
                style={{
                  backgroundColor: swimlane.colorScheme.secondary,
                  color: primaryColor,
                }}
              >
                <IconRenderer name={swimlane.icon} size={18} />
              </div>
            )}
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {swimlane?.title || 'Calendar Event'}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                {isInProgress && (
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white shadow-sm"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Sparkles size={11} className="animate-spin" />
                    <span>In Progress ({progressPercent}%)</span>
                  </span>
                )}
                {isPast && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/5">
                    <CheckCircle2 size={11} className="text-slate-500 dark:text-slate-400" />
                    <span>Completed</span>
                  </span>
                )}
                {isFuture && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/5">
                    Upcoming
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button variant="ghost" tone="neutral" onClick={onClose} aria-label="Close" icon={<X />} />
        </div>

        {/* Full Event Title */}
        <h2 id="event-detail-title" className="mt-4 text-xl font-semibold tracking-normal text-slate-900 dark:text-white leading-snug break-words">
          {event.title}
        </h2>

        {/* Details Grid */}
        <div className="mt-4 space-y-3 pt-3 border-t border-slate-200/80 dark:border-white/10 text-sm">
          {/* Date & Time */}
          <div className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
            <Clock size={18} className="shrink-0 mt-0.5 text-slate-400" />
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                {event.isAllDay
                  ? 'All Day Event'
                  : formatEventTimeRange(new Date(event.start), new Date(event.end), formatTime)}
                {!event.isAllDay && (
                  <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                    ({durationStr})
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                <CalendarIcon size={12} />
                <span>{dateStr}</span>
              </div>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
              <MapPin size={18} className="shrink-0 mt-0.5 text-rose-500 dark:text-rose-400" />
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Location
                </span>
                <a
                  href={getGoogleMapsUrl(event.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-1.5 text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors break-words text-left mt-0.5"
                  title="Open location on Google Maps in a new tab"
                >
                  <span className="underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2 group-hover:decoration-indigo-500">
                    {event.location}
                  </span>
                  <ExternalLink size={13} className="shrink-0 opacity-60 group-hover:opacity-100 transition-opacity text-indigo-500 dark:text-indigo-400" />
                </a>
              </div>
            </div>
          )}

          {/* Description / Notes */}
          {event.description && (
            <div className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
              <AlignLeft size={18} className="shrink-0 mt-0.5 text-indigo-500 dark:text-indigo-400" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Notes & Details
                </span>
                <div className="text-slate-800 dark:text-slate-300 mt-1.5 text-xs leading-relaxed whitespace-pre-wrap break-words max-h-56 overflow-y-auto pr-2 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-200/80 dark:border-white/5 font-sans">
                  {renderFormattedDescription(event.description)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-3 border-t border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-3">
          {swimlane?.source.calendarSource === 'file' ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">Imported calendar</span>
          ) : (
            <a
              href={
                event.googleCalendarUrl ||
                event.url ||
                `https://calendar.google.com/calendar/r/day/${new Date(event.start).getFullYear()}/${new Date(event.start).getMonth() + 1}/${new Date(event.start).getDate()}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClassName({ tone: 'neutral' })}
              title="Open and edit this event in Google Calendar"
            >
              <ExternalLink className="text-indigo-500 dark:text-indigo-400" />
              <span>Open in Google Calendar</span>
            </a>
          )}

          <Button
            tone="primary"
            onClick={onClose}
            className="hover:brightness-110"
            style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
          >
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
