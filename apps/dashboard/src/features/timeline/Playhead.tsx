import React from 'react'
import type { TimelineOrientation } from '@dashboard/features/settings'

interface PlayheadProps {
  percent: number // 0 to 100
  currentTime: Date
  orientation: TimelineOrientation
  clock24h?: boolean
}

export const Playhead: React.FC<PlayheadProps> = ({
  percent,
  orientation,
}) => {
  if (orientation === 'horizontal') {
    return (
      <div
        className="absolute top-0 bottom-0 pointer-events-none transition-all duration-700 ease-out"
        style={{ left: `${percent}%` }}
      >
        {/* Playhead line: slightly transparent so data under it is readable while remaining bright & luminous */}
        <div className="absolute top-0 bottom-0 -left-[1px] w-[2px] bg-rose-500/75 shadow-[0_0_8px_rgba(244,63,94,0.45)]" />
      </div>
    )
  }

  // Vertical orientation
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none transition-all duration-700 ease-out"
      style={{ top: `${percent}%` }}
    >
      {/* Playhead line: slightly transparent so data under it is readable while remaining bright & luminous */}
      <div className="absolute left-0 right-0 -top-[1px] h-[2px] bg-rose-500/75 shadow-[0_0_8px_rgba(244,63,94,0.45)]" />
    </div>
  )
}
