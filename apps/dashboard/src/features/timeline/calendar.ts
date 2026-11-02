export interface CalendarEvent {
  id: string
  swimlaneId: string
  title: string
  description?: string
  location?: string
  start: Date
  end: Date
  isAllDay: boolean
  url?: string
  googleCalendarUrl?: string
}

export interface PositionedEvent extends CalendarEvent {
  startPercent: number // 0 to 100 percentage across the 24h timeline
  endPercent: number   // 0 to 100 percentage
  widthPercent: number // endPercent - startPercent
  
  // Status relative to the playhead
  isPast: boolean
  isFuture: boolean
  isInProgress: boolean
  
  // Progress fraction (0 to 1) for in-progress events
  progressFraction: number
  splitOffsetPercent: number // Percentage within the event where the playhead falls

  // Overlap and sub-track positioning
  trackIndex?: number
  totalTracks?: number
}
