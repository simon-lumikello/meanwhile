/**
 * Where to draw an aircraft between position reports, which arrive only with each
 * snapshot. The renderer guesses in between: along the reported turn for a while,
 * then straight. When the next report disagrees with the guess, a small miss glides
 * into place; a large one is a jump, and the caller shows the aircraft afresh at
 * its real position.
 */
import type { AirplaneData } from './types'
import { latLonToWebMercator } from './mercator'

/** Beyond this a guess is too far off to show; covers a missed refresh or two. */
export const MAX_EXTRAPOLATION_MS = 4 * 60 * 1000
/** A reported turn is followed for at most this long, then the guess flies straight; few turns last longer. */
export const MAX_TURN_S = 30
/** A miss up to this far (ground meters) glides into place instead of jumping. */
export const GLIDE_MAX_METERS = 8_000
/** How long a glide takes. */
export const GLIDE_MS = 4_000
/** A pose not shown for this long (hidden tab, paused loop) is not glided from. */
const GLIDE_STALE_MS = 1_000

/** A position in EPSG:3857 meters and a track in degrees from north. */
export interface AircraftPose {
  x: number
  y: number
  track: number
}

export interface AircraftMotion {
  /** The report the current guess is based on. */
  lastContact: number | null
  /** When that report was first shown. */
  guessSince: number
  shown: AircraftPose | null
  shownAt: number
  /** What is left of a miss, added to the guess while it glides away. */
  correction: { x: number; y: number; track: number; start: number } | null
}

/** A miss found by a new report: how far the shown pose was from the new guess, in EPSG:3857 meters. */
export interface AircraftMiss {
  x: number
  y: number
  /** When the guess that missed was first shown; its error grew from then. */
  since: number
}

export interface ShownAircraft {
  /** Where to draw the aircraft. */
  pose: AircraftPose
  /** The best guess of where it really is; `pose` glides onto it after a miss. */
  guess: AircraftPose
  /** A new report missed by more than `GLIDE_MAX_METERS`; the aircraft is shown afresh. */
  jumped: boolean
  /** Set on the frame a new report missed by a distance small enough to glide. */
  miss: AircraftMiss | null
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const normalizeTrack = (degrees: number) => ((degrees % 360) + 360) % 360
/** The signed turn from `to` to `from`, within ±180 degrees. */
const trackDifference = (from: number, to: number) => normalizeTrack(from - to + 180) - 180

/**
 * Where the aircraft is `elapsedMs` after its report: along an arc at the reported
 * rate of turn for up to `MAX_TURN_S`, then straight. Moves in Web Mercator, which
 * is close enough for these distances; 1 ground meter is 1 / cos(latitude) map meters.
 */
export function predictAircraft(plane: AirplaneData, elapsedMs: number): AircraftPose {
  const elapsedS = Math.max(0, elapsedMs) / 1000
  const scale = 1 / Math.cos(toRadians(plane.latitude))
  const start = latLonToWebMercator(plane.latitude, plane.longitude)
  const speed = plane.velocity
  const startTrack = toRadians(plane.trueTrack)
  const rate = toRadians(plane.trackRate ?? 0)
  const turnS = Math.min(elapsedS, MAX_TURN_S)
  let east: number
  let north: number
  let track = startTrack
  if (Math.abs(rate * turnS) < 1e-6) {
    east = speed * elapsedS * Math.sin(startTrack)
    north = speed * elapsedS * Math.cos(startTrack)
  } else {
    track = startTrack + rate * turnS
    const radius = speed / rate
    east = radius * (Math.cos(startTrack) - Math.cos(track)) + speed * (elapsedS - turnS) * Math.sin(track)
    north = radius * (Math.sin(track) - Math.sin(startTrack)) + speed * (elapsedS - turnS) * Math.cos(track)
  }
  return { x: start.x + east * scale, y: start.y + north * scale, track: normalizeTrack((track * 180) / Math.PI) }
}

export function createAircraftMotion(): AircraftMotion {
  return { lastContact: null, guessSince: 0, shown: null, shownAt: 0, correction: null }
}

function smoothstep(value: number) {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

/**
 * The pose to draw at `now`, the guess it glides onto, and what a new report
 * changed: a miss up to `GLIDE_MAX_METERS` glides, a larger one is a jump.
 */
export function showAircraft(motion: AircraftMotion, plane: AirplaneData, now: number): ShownAircraft {
  const predicted = predictAircraft(plane, now - plane.lastContact * 1000)
  let jumped = false
  let miss: AircraftMiss | null = null
  if (plane.lastContact !== motion.lastContact) {
    const previous = motion.shown && now - motion.shownAt <= GLIDE_STALE_MS ? motion.shown : null
    motion.correction = null
    motion.lastContact = plane.lastContact
    if (previous) {
      const dx = previous.x - predicted.x
      const dy = previous.y - predicted.y
      const missMeters = Math.hypot(dx, dy) * Math.cos(toRadians(plane.latitude))
      if (missMeters <= GLIDE_MAX_METERS) {
        motion.correction = { x: dx, y: dy, track: trackDifference(previous.track, predicted.track), start: now }
        miss = { x: dx, y: dy, since: motion.guessSince }
      } else jumped = true
    }
    motion.guessSince = now
  }

  let pose = predicted
  const correction = motion.correction
  if (correction) {
    const remaining = 1 - smoothstep((now - correction.start) / GLIDE_MS)
    if (remaining <= 0) motion.correction = null
    else pose = {
      x: predicted.x + correction.x * remaining,
      y: predicted.y + correction.y * remaining,
      track: normalizeTrack(predicted.track + correction.track * remaining),
    }
  }
  motion.shown = pose
  motion.shownAt = now
  return { pose, guess: predicted, jumped, miss }
}
