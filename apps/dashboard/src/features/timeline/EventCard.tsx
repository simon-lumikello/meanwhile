import React from 'react'
import { MapPin, Clock, CheckCircle2 } from 'lucide-react'
import type { PositionedEvent } from './calendar'
import type { SwimlaneColorScheme } from '@dashboard/features/settings'
import type { TimelineOrientation } from '@dashboard/features/settings'
import { getGoogleMapsUrl } from './maps'
import { formatEventTimeRange } from './eventTimeLabel'

export interface HoveredEventInfo {
  event: PositionedEvent
  colorScheme: SwimlaneColorScheme
  rect: DOMRect
}

interface EventCardProps {
  event: PositionedEvent
  colorScheme: SwimlaneColorScheme
  mutePastEvents: boolean
  orientation: TimelineOrientation
  clock24h?: boolean
  isDark?: boolean
  onSelect?: (event: PositionedEvent) => void
  onHover?: (info: HoveredEventInfo | null) => void
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  colorScheme,
  mutePastEvents,
  orientation,
  clock24h = true,
  isDark = true,
  onSelect,
  onHover,
}) => {
  const formatTime = (d: Date) => {
    return clock24h
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const timeLabel = event.isAllDay
    ? 'All Day'
    : formatEventTimeRange(event.start, event.end, formatTime)

  const compactTimeLabel = event.isAllDay
    ? 'All Day'
    : formatEventTimeRange(event.start, event.end, formatTime, '–')

  const isHorizontal = orientation === 'horizontal'
  const isNarrow = event.widthPercent < 5.8
  const isUltraNarrow = event.widthPercent < 3.2

  // Multi-track overlap layout
  const totalTracks = event.totalTracks || 1
  const trackIndex = event.trackIndex || 0
  const trackPct = 100 / totalTracks

  // Non-touching borders: 2px inward on each side gives a clean 4px visual gap between adjacent blocks
  const posStyle: React.CSSProperties = isHorizontal
    ? {
        left: `calc(${event.startPercent}% + 2px)`,
        width: `calc(${event.widthPercent}% - 4px)`,
        top: totalTracks > 1 ? `calc(${trackIndex * trackPct}% + 2px)` : '4px',
        height: totalTracks > 1 ? `calc(${trackPct}% - 4px)` : 'calc(100% - 8px)',
      }
    : {
        top: `calc(${event.startPercent}% + 2px)`,
        height: `calc(${event.widthPercent}% - 4px)`,
        left: totalTracks > 1 ? `calc(${trackIndex * trackPct}% + 2px)` : '4px',
        width: totalTracks > 1 ? `calc(${trackPct}% - 4px)` : 'calc(100% - 8px)',
        minHeight: '22px',
      }

  // Determine styling based on past/future/in-progress and mute setting
  const isMuted = mutePastEvents && event.isPast
  const isActive = event.isInProgress // Directly hit by the playhead line right now
  const splitPct = event.splitOffsetPercent
  const isSplitActive = isActive && mutePastEvents && splitPct > 0 && splitPct < 100

  let backgroundStyle = colorScheme.secondary
  let borderStyle = `1px solid ${colorScheme.primary}44`
  let glowStyle = 'none'

  if (isMuted) {
    backgroundStyle = isDark ? 'rgba(15, 23, 42, 0.45)' : 'rgba(241, 245, 249, 0.85)'
    borderStyle = isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(203, 213, 225, 0.7)'
    glowStyle = 'none'
  } else if (isActive) {
    if (isDark) {
      // Dark Mode active styling:
      if (isSplitActive) {
        // Base layer is darkened muted slate (elapsed slice); overlay provides the bright luminous remaining slice
        backgroundStyle = 'rgba(15, 23, 42, 0.75)'
      } else {
        // Whole event is active and remaining: full vibrant luminous gradient!
        backgroundStyle = `linear-gradient(135deg, ${colorScheme.primary} 0%, ${colorScheme.accent || colorScheme.primary} 100%)`
      }

      borderStyle = `1.5px solid ${colorScheme.accent}`
      glowStyle = `0 0 24px ${colorScheme.primary}66, inset 0 1px 1px rgba(255, 255, 255, 0.45), inset 0 0 16px ${colorScheme.primary}30`
    } else {
      // Bright / Light theme active styling:
      if (isSplitActive) {
        // Base layer is muted slate-100 (elapsed slice); overlay provides the bright primary slice
        backgroundStyle = 'rgba(241, 245, 249, 0.94)'
      } else {
        // Whole event is active and remaining: full bright primary gradient!
        backgroundStyle = `linear-gradient(135deg, ${colorScheme.primary} 0%, ${colorScheme.accent || colorScheme.primary} 100%)`
      }

      borderStyle = `2px solid ${colorScheme.primary}`
      glowStyle = `0 4px 20px -2px ${colorScheme.primary}55, 0 2px 6px -1px rgba(0, 0, 0, 0.12)`
    }
  } else {
    // Not active yet (future blocks): calmer, softer presence
    if (isDark) {
      backgroundStyle = colorScheme.secondary
      borderStyle = `1px solid ${colorScheme.primary}44`
      glowStyle = 'none'
    } else {
      // Light theme future blocks: subtle, colorful tint matching the lane with clean white base for crisp readability
      backgroundStyle = `linear-gradient(0deg, ${colorScheme.secondary}, ${colorScheme.secondary}), linear-gradient(0deg, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.88))`
      borderStyle = `1px solid ${colorScheme.primary}55`
      glowStyle = `0 1px 3px rgba(0, 0, 0, 0.04), 0 2px 8px -2px ${colorScheme.primary}25`
    }
  }

  const stateClass = isMuted
    ? 'opacity-50 grayscale-[30%] hover:opacity-90 hover:grayscale-0 z-0'
    : isActive
    ? isDark
      ? 'opacity-100 shadow-xl ring-1 ring-white/25 z-10 hover:brightness-110'
      : 'opacity-100 shadow-xl z-10 hover:shadow-2xl'
    : isDark
    ? 'opacity-80 hover:opacity-100 hover:brightness-105 hover:border-white/30 z-[5]'
    : 'opacity-95 hover:opacity-100 hover:shadow-md z-[5]'

  const targetOpacity = isMuted ? 0.5 : isActive ? 1.0 : isDark ? 0.8 : 0.95

  // Dynamic line clamping based on available vertical room in horizontal vs vertical modes
  let lineClampClass = 'line-clamp-5 text-sm'
  if (isHorizontal) {
    if (totalTracks >= 3) {
      lineClampClass = 'line-clamp-2 text-xs'
    } else if (totalTracks === 2) {
      lineClampClass = 'line-clamp-3 text-xs'
    } else if (isUltraNarrow) {
      lineClampClass = 'line-clamp-6 text-[11px]'
    } else if (isNarrow) {
      lineClampClass = 'line-clamp-5 text-xs'
    } else {
      lineClampClass = 'line-clamp-5 text-sm'
    }
  } else {
    // Vertical mode (card height corresponds to duration)
    if (totalTracks >= 2) {
      lineClampClass = event.widthPercent < 4 ? 'line-clamp-2 text-xs' : 'line-clamp-3 text-xs'
    } else if (event.widthPercent < 4.0) {
      lineClampClass = 'line-clamp-2 text-xs'
    } else if (event.widthPercent < 7.0) {
      lineClampClass = 'line-clamp-3 text-xs'
    } else if (event.widthPercent < 10.0) {
      lineClampClass = 'line-clamp-4 text-sm'
    } else {
      lineClampClass = 'line-clamp-6 text-sm'
    }
  }

  // Smooth fade transition masks so text that overflows dissolves gently rather than hard-clipping
  const verticalFadeMask: React.CSSProperties = {
    maskImage:
      'linear-gradient(to bottom, black 0%, black calc(100% - 6px), transparent 100%)',
    WebkitMaskImage:
      'linear-gradient(to bottom, black 0%, black calc(100% - 6px), transparent 100%)',
  }

  const horizontalFadeMask: React.CSSProperties = {
    maskImage:
      'linear-gradient(to right, black 0%, black calc(100% - 10px), transparent 100%)',
    WebkitMaskImage:
      'linear-gradient(to right, black 0%, black calc(100% - 10px), transparent 100%)',
  }

  const renderCardContent = (isOverlay = false) => {
    const titleColor = isMuted
      ? isDark ? '#94a3b8' : '#64748b'
      : isOverlay
      ? '#ffffff'
      : isActive
      ? isDark
        ? isSplitActive
          ? '#94a3b8'
          : '#ffffff'
        : isSplitActive
        ? '#0f172a'
        : '#ffffff'
      : isDark ? colorScheme.text : '#0f172a'

    const titleShadow = isOverlay
      ? isDark
        ? `0 0 12px ${colorScheme.primary}88, 0 1px 3px rgba(0, 0, 0, 0.5)`
        : '0 1px 3px rgba(0, 0, 0, 0.35)'
      : isActive && isDark && !isSplitActive
      ? `0 0 12px ${colorScheme.primary}88`
      : 'none'

    const subtextColor = isOverlay
      ? 'text-white/95 font-semibold'
      : isActive
      ? isDark
        ? isSplitActive
          ? 'text-slate-400'
          : 'text-white/90'
        : isSplitActive
        ? 'text-slate-800 font-semibold'
        : 'text-white/95 font-semibold'
      : isMuted
      ? isDark ? 'text-slate-500' : 'text-slate-400'
      : isNarrow
      ? isDark ? 'text-slate-300' : 'text-slate-600'
      : isDark ? 'text-slate-400' : 'text-slate-600'

    const clockColor = isOverlay
      ? 'opacity-95 text-white'
      : isActive
      ? isDark
        ? isSplitActive
          ? 'opacity-70 text-slate-400'
          : 'opacity-90 text-white'
        : isSplitActive
        ? 'opacity-85 text-slate-700'
        : 'opacity-95 text-white'
      : 'opacity-70'

    const pinClass = isOverlay || (isActive && !isSplitActive)
      ? 'text-white'
      : isSplitActive && isDark
      ? 'text-rose-400/70'
      : 'text-rose-500 dark:text-rose-400'

    const isShortVertical = !isHorizontal && event.widthPercent < 2.2

    if (isShortVertical) {
      return (
        <div
          className={`w-full h-full flex items-center justify-between gap-1.5 overflow-hidden text-xs ${
            isNarrow ? 'px-2 py-0.5' : 'px-2.5 py-0.5'
          }`}
          style={horizontalFadeMask}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            <span
              className="font-semibold truncate leading-none text-xs"
              style={{
                color: titleColor,
                textShadow: titleShadow,
              }}
            >
              {event.title}
            </span>
            <span
              className={`shrink-0 text-[10px] font-medium tabular-numbers leading-none ${subtextColor}`}
            >
              {formatTime(event.start)}
            </span>
          </div>

          {isMuted && !isOverlay && (
            <CheckCircle2 size={11} className="shrink-0 text-slate-400 dark:text-slate-500 opacity-80" />
          )}
        </div>
      )
    }

    return (
      <div
        className={`w-full h-full flex flex-col justify-between overflow-hidden ${
          isNarrow ? 'px-2.5 py-1' : 'px-3 py-2'
        }`}
      >
        {/* Top row: Multi-line Title and Status Badge (glued to top) with smooth fade mask */}
        <div className="flex items-start justify-between gap-1 min-w-0 flex-1 h-full min-h-0 overflow-hidden">
          <div
            className="flex flex-col min-w-0 flex-1 h-full min-h-0 overflow-hidden"
            style={verticalFadeMask}
          >
            <h4
              className={`font-semibold tracking-normal leading-tight break-words [overflow-wrap:anywhere] [word-break:break-word] hyphens-auto ${lineClampClass}`}
              style={{
                color: titleColor,
                textShadow: titleShadow,
              }}
            >
              {event.title}
            </h4>

            {event.description &&
              event.description.trim() &&
              event.description.trim() !== event.title.trim() &&
              !isNarrow &&
              totalTracks <= 1 && (
                <p
                  className={`text-[11px] mt-0.5 break-words [overflow-wrap:anywhere] [word-break:break-word] leading-tight ${
                    isOverlay
                      ? 'text-white/90'
                      : isDark
                      ? isSplitActive
                        ? 'text-slate-400'
                        : 'text-slate-300/80'
                      : isActive
                      ? 'text-slate-700'
                      : 'text-slate-600'
                  }`}
                >
                  {event.description}
                </p>
              )}
          </div>

          {isMuted && !isUltraNarrow && !isOverlay && (
            <CheckCircle2 size={12} className="shrink-0 text-slate-400 dark:text-slate-500 mt-0.5 opacity-80" />
          )}
        </div>

        {/* Bottom row: Time and Location details (glued to bottom) */}
        <div
          className={`flex items-center gap-1.5 mt-0.5 font-medium tabular-numbers overflow-hidden shrink-0 ${
            isNarrow ? 'text-[10px]' : 'text-[11px]'
          } ${subtextColor}`}
        >
          <span className="flex items-center gap-1 shrink-0 font-semibold">
            {!isNarrow && (
              <Clock size={11} className={`${clockColor} shrink-0`} />
            )}
            <span className="truncate">
              {isUltraNarrow ? formatTime(event.start) : isNarrow ? compactTimeLabel : timeLabel}
            </span>
          </span>

          {!isNarrow && event.location && (
            <a
              href={getGoogleMapsUrl(event.location)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Open "${event.location}" on Google Maps`}
              className={`flex items-center gap-0.5 truncate ml-1 hover:underline hover:opacity-100 transition-opacity cursor-pointer z-[1] ${
                isOverlay ? 'opacity-90 text-white' : 'opacity-80'
              }`}
            >
              <MapPin size={10} className={`shrink-0 ${pinClass}`} />
              <span className="truncate">{event.location}</span>
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => onSelect?.(event)}
      onMouseEnter={(e) => {
        onHover?.({
          event,
          colorScheme,
          rect: e.currentTarget.getBoundingClientRect(),
        })
      }}
      onMouseLeave={() => {
        onHover?.(null)
      }}
      className={`absolute rounded-xl flex flex-col justify-between overflow-hidden transition-all duration-150 group cursor-pointer select-none hover:shadow-xl ${
        isDark ? 'hover:brightness-110' : ''
      } active:brightness-95 animate-event-fade-in ${stateClass}`}
      style={{
        ...posStyle,
        background: backgroundStyle,
        border: borderStyle,
        boxShadow: glowStyle,
        '--target-opacity': targetOpacity,
      } as React.CSSProperties}
    >
      {/* Base card content */}
      {renderCardContent(false)}

      {/* Active remaining overlay slice with vivid fill & white text */}
      {isSplitActive && (
        <div
          className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden z-[5]"
          style={{
            background: `linear-gradient(135deg, ${colorScheme.primary} 0%, ${colorScheme.accent || colorScheme.primary} 100%)`,
            clipPath: isHorizontal
              ? `inset(0 0 0 ${splitPct}%)`
              : `inset(${splitPct}% 0 0 0)`,
            boxShadow: isDark ? `inset 0 0 24px ${colorScheme.primary}44` : undefined,
          }}
        >
          {renderCardContent(true)}
        </div>
      )}

      {/* Active split progress hairline divider */}
      {isActive && mutePastEvents && splitPct > 0 && splitPct < 100 && (
        <div
          className="absolute pointer-events-none z-10"
          style={
            isHorizontal
              ? {
                  left: `calc(${splitPct}% + ${(2 * event.progressFraction - 1) * 2}px)`,
                  top: 0,
                  bottom: 0,
                  width: '2px',
                  transform: 'translateX(-1px)',
                  backgroundColor: '#ffffff',
                  boxShadow: isDark
                    ? `0 0 8px #ffffff, 0 0 14px ${colorScheme.accent}`
                    : `0 0 6px #ffffff, 0 0 10px ${colorScheme.primary}`,
                }
              : {
                  top: `calc(${splitPct}% + ${(2 * event.progressFraction - 1) * 2}px)`,
                  left: 0,
                  right: 0,
                  height: '2px',
                  transform: 'translateY(-1px)',
                  backgroundColor: '#ffffff',
                  boxShadow: isDark
                    ? `0 0 8px #ffffff, 0 0 14px ${colorScheme.accent}`
                    : `0 0 6px #ffffff, 0 0 10px ${colorScheme.primary}`,
                }
          }
        />
      )}
    </div>
  )
}
