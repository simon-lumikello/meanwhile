export interface AuroraKpPoint {
  time: string // ISO string or UTC timestamp
  kp: number
  observed: 'observed' | 'predicted'
  noaaScale: string | null
}

export interface AuroraDayVisibilityStatus {
  hasAurora: boolean
  peakKp: number
  activeHourTimestamps: string[]
  summary: string
}

export interface AuroraVisibilityStatus {
  /** True if aurora visibility is likely for any dark hour tonight */
  hasAuroraTonight: boolean
  /** True if conditions are favorable right now */
  isCurrentlyVisible: boolean
  /** Peak Kp index forecast during dark hours tonight */
  peakKp: number
  /** Threshold Kp required for aurora visibility at this latitude */
  thresholdKp: number
  /** ISO strings of hours where aurora visibility conditions align */
  activeHourTimestamps: string[]
  /** Short label for the UI (e.g. 'Aurora Forecast (Kp 5.3)' or 'Aurora Active') */
  summary: string

  /** True if planetary Kp meets or exceeds latitude threshold during dark hours right now (regardless of clouds) */
  isAuroraOngoing?: boolean
  /** Estimated planetary Kp index at the current hour */
  currentKp?: number

  /** Tomorrow evening / night aurora forecast status */
  tomorrow?: AuroraDayVisibilityStatus
}
