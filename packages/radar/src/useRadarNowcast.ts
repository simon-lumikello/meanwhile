import { useEffect, useRef, useState } from 'react'
import { runRadarNowcast, type RadarNowcast } from './nowcastRunner'
import type { RadarFilterMode, RadarFrameSource } from './types'

export type RadarNowcastState =
  | { status: 'off' }
  /** `progress` runs from 0 to 1. */
  | { status: 'loading'; progress: number }
  | { status: 'ready'; nowcast: RadarNowcast }
  | { status: 'unavailable' }

export interface UseRadarNowcastParams {
  enabled: boolean
  source?: RadarFrameSource
  filterMode: RadarFilterMode
  /** Scan times to try as the base, latest first. */
  candidates: string[]
  minutes: number
  latitude: number
  longitude: number
  surfaceWind?: { speedMs: number; directionDeg: number }
}

type Result =
  | { key: string; progress: number }
  | { key: string; nowcast: RadarNowcast | null }

/** Progress is reported in steps of this size, so rendering does not re-render the host per frame. */
const PROGRESS_STEP = 0.05

/**
 * Runs a radar forecast while `enabled` and hands it over only once every frame is
 * rendered. A new source, filter, base scan, length, or place starts over; the previous
 * run is cancelled.
 */
export function useRadarNowcast({ enabled, source, filterMode, candidates, minutes, latitude, longitude, surfaceWind }: UseRadarNowcastParams): RadarNowcastState {
  const key = enabled && source && candidates.length > 0 && minutes > 0
    ? `${source.id}|${filterMode}|${candidates.join(',')}|${minutes}|${latitude.toFixed(2)}|${longitude.toFixed(2)}`
    : null
  // What a forecast is for, apart from the scans it starts from: a refresh of the same scope keeps showing the previous forecast until the new one is done.
  const scope = key ? `${source?.id}|${filterMode}|${minutes}|${latitude.toFixed(2)}|${longitude.toFixed(2)}` : null
  const [result, setResult] = useState<Result | null>(null)
  const [lastReady, setLastReady] = useState<{ scope: string; nowcast: RadarNowcast } | null>(null)
  // Read at start: frames and winds are keyed by the source id, and a wind update alone never restarts the run.
  const latest = useRef({ source, filterMode, candidates, minutes, latitude, longitude, surfaceWind })
  useEffect(() => { latest.current = { source, filterMode, candidates, minutes, latitude, longitude, surfaceWind } })

  useEffect(() => {
    const { source: current, ...request } = latest.current
    if (!key || !current) return
    const controller = new AbortController()
    let reported = 0
    void runRadarNowcast({
      ...request,
      source: current,
      signal: controller.signal,
      onProgress: progress => {
        if (progress - reported < PROGRESS_STEP) return
        reported = progress
        setResult({ key, progress })
      },
    }).then(nowcast => {
      if (controller.signal.aborted) return
      setResult({ key, nowcast })
      if (nowcast && scope) setLastReady({ scope, nowcast })
    })
    return () => controller.abort()
  }, [key, scope])

  if (!key) return { status: 'off' }
  if (result?.key !== key || 'progress' in result) {
    if (lastReady && lastReady.scope === scope) return { status: 'ready', nowcast: lastReady.nowcast }
    return { status: 'loading', progress: result?.key === key && 'progress' in result ? result.progress : 0 }
  }
  return result.nowcast ? { status: 'ready', nowcast: result.nowcast } : { status: 'unavailable' }
}
