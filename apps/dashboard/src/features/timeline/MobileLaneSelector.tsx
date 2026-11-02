import React from 'react'
import { ChevronLeft, ChevronRight, Columns, Square } from 'lucide-react'
import type { SwimlaneConfig } from '@dashboard/features/settings'
import type { PositionedEvent } from './calendar'
import { IconRenderer } from '@dashboard/components/common/IconRenderer'
import { Button } from '@simon-lumikello/meanwhile-ui/react'

interface MobileLaneSelectorProps {
  swimlanes: SwimlaneConfig[]
  eventsByLane: Record<string, PositionedEvent[]>
  selectedLaneIds?: string[]
  onToggleLane?: (laneId: string) => void
  selectedIndex?: number
  onSelectIndex?: (index: number) => void
  laneCount: 1 | 2
  onToggleLaneCount: () => void
  onPrevLane?: () => void
  onNextLane?: () => void
  canPrev?: boolean
  canNext?: boolean
  isDark?: boolean
}

export const MobileLaneSelector: React.FC<MobileLaneSelectorProps> = ({
  swimlanes,
  eventsByLane,
  selectedLaneIds,
  onToggleLane,
  selectedIndex,
  onSelectIndex,
  laneCount,
  onToggleLaneCount,
  onPrevLane,
  onNextLane,
  canPrev,
  canNext,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Resolve effective selected lane IDs (favor selectedLaneIds, fall back to selectedIndex)
  const effectiveSelectedIds = React.useMemo(() => {
    if (selectedLaneIds && selectedLaneIds.length > 0) {
      return selectedLaneIds
    }
    if (selectedIndex !== undefined && swimlanes[selectedIndex]) {
      if (laneCount === 2 && swimlanes[selectedIndex + 1]) {
        return [swimlanes[selectedIndex].id, swimlanes[selectedIndex + 1].id]
      }
      return [swimlanes[selectedIndex].id]
    }
    return swimlanes.length > 0 ? [swimlanes[0].id] : []
  }, [selectedLaneIds, selectedIndex, swimlanes, laneCount])

  // Scroll active tab into view when selection changes
  React.useEffect(() => {
    if (!containerRef.current || effectiveSelectedIds.length === 0) return
    const targetId = effectiveSelectedIds[effectiveSelectedIds.length - 1]
    const activeEl = containerRef.current.querySelector<HTMLElement>(`[data-lane-id="${targetId}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [effectiveSelectedIds])

  const effectiveCanPrev =
    canPrev !== undefined
      ? canPrev
      : selectedIndex !== undefined
      ? selectedIndex > 0
      : false

  const effectiveCanNext =
    canNext !== undefined
      ? canNext
      : selectedIndex !== undefined
      ? selectedIndex < swimlanes.length - 1
      : false

  const handlePrev = () => {
    if (onPrevLane) {
      onPrevLane()
    } else if (onSelectIndex && selectedIndex !== undefined && selectedIndex > 0) {
      onSelectIndex(selectedIndex - 1)
    }
  }

  const handleNext = () => {
    if (onNextLane) {
      onNextLane()
    } else if (onSelectIndex && selectedIndex !== undefined && selectedIndex < swimlanes.length - 1) {
      onSelectIndex(selectedIndex + 1)
    }
  }

  const handleLaneClick = (laneId: string, idx: number) => {
    if (onToggleLane) {
      onToggleLane(laneId)
    } else if (onSelectIndex) {
      onSelectIndex(idx)
    }
  }

  if (swimlanes.length === 0) return null

  return (
    <div className="md:hidden flex items-center justify-between gap-1.5 px-3 py-1.5 bg-slate-100/90 dark:bg-[#0c1322] border-b border-slate-200 dark:border-white/10 shrink-0 z-30 transition-colors">
      {/* Prev Lane Stepper */}
      <Button onClick={handlePrev} disabled={!effectiveCanPrev} hideLabel icon={<ChevronLeft />}>
        Previous Lane
      </Button>

      {/* Scrollable Chips List */}
      <div
        ref={containerRef}
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1 scroll-smooth flex-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {swimlanes.map((lane, idx) => {
          const isSelected = effectiveSelectedIds.includes(lane.id)
          const isWeather = lane.type === 'weather'
          const eventCount = eventsByLane[lane.id]?.length || 0

          return (
            <button
              key={lane.id}
              data-lane-id={lane.id}
              data-lane-idx={idx}
              onClick={() => handleLaneClick(lane.id, idx)}
              aria-pressed={isSelected}
              title={
                laneCount === 2
                  ? isSelected
                    ? `${lane.title} (Selected - Click to toggle off)`
                    : `Click to show ${lane.title}`
                  : `Show ${lane.title}`
              }
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer transition-all border ${
                isSelected
                  ? 'bg-white dark:bg-slate-800/95 shadow-sm text-slate-900 dark:text-white'
                  : 'bg-transparent border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/5'
              }`}
              style={{
                borderColor: isSelected ? lane.colorScheme.primary : 'transparent',
                boxShadow: isSelected
                  ? `0 2px 8px -2px ${lane.colorScheme.primary}40`
                  : undefined,
              }}
            >
              {/* Icon badge */}
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: lane.colorScheme.secondary,
                  color: lane.colorScheme.primary,
                }}
              >
                <IconRenderer name={lane.icon} size={12} />
              </div>

              {/* Title */}
              <span className="truncate max-w-[100px]">{lane.title}</span>

              {/* Event count or weather badge */}
              {!isWeather ? (
                <span
                  className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-numbers ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {eventCount}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Next Lane Stepper */}
      <Button onClick={handleNext} disabled={!effectiveCanNext} hideLabel icon={<ChevronRight />}>
        Next Lane
      </Button>

      {/* 1-Lane vs 2-Lanes Toggle Button */}
      {swimlanes.length > 1 && (
        <Button
          tone={laneCount === 2 ? 'primary' : 'neutral'}
          onClick={onToggleLaneCount}
          title={laneCount === 1 ? 'Switch to 2-Lane view' : 'Switch to 1-Lane view'}
          aria-label="Toggle 1 or 2 Lanes view"
          icon={laneCount === 1 ? <Square /> : <Columns />}
        >
          {laneCount === 1 ? '1 Lane' : '2 Lanes'}
        </Button>
      )}
    </div>
  )
}
