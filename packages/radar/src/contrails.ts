/**
 * Contrail trails in EPSG:3857 meters. Everything here is independent of the camera,
 * so a trail keeps its shape while the map zooms and pans; only drawing converts to
 * pixels.
 *
 * Wind: the radar has a single surface wind reading for the observer, not a wind
 * field. Upper-level wind is estimated from it, and every trail in view drifts,
 * spreads, and breaks up with that one estimate. Without a wind reading trails only
 * widen and fade in place.
 *
 * Position reports are sparse, so the aircraft is drawn at a guess that each report
 * corrects. The trail is laid along the guess, not along the pose on screen: when a
 * report shows the guess was off, the trail laid since the previous report bends onto
 * the straight line between them (the error grew steadily over that time), easing
 * over while the aircraft glides to its corrected position. Following the glide
 * itself would leave a sideways step in the trail.
 */

/** How long a trail point lives before it has fully dissolved. */
export const CONTRAIL_LIFE_MS = 85_000
/** How long a piece of trail the aircraft has left behind (it jumped or vanished) takes to dissolve. */
export const CONTRAIL_ORPHAN_FADE_MS = 6_000
/** Time between recorded trail points. */
export const CONTRAIL_SAMPLE_INTERVAL_MS = 500
/** A jump longer than this (a position refresh correcting the extrapolation) orphans the trail laid so far and starts a new piece. */
export const CONTRAIL_MAX_STEP_METERS = 2_000
/** Upper-level wind is roughly this multiple of surface wind. */
const UPPER_WIND_FACTOR = 3
/** Ground width of a fresh trail. */
export const CONTRAIL_INITIAL_WIDTH_METERS = 60
/** Wavelength of the ripples an ageing trail breaks up along (Crow instability). */
const BREAKUP_WAVELENGTH_METERS = 900
/** Sideways swing of those ripples at the end of a trail's life, before wind. */
const BREAKUP_AMPLITUDE_METERS = 90
const EARTH_RADIUS_METERS = 6378137

export interface ContrailPoint {
  /** Where the aircraft was, in EPSG:3857 meters. */
  x: number
  y: number
  born: number
  /** Ground distance along the trail from the start of its piece; phases the break-up. */
  distance: number
  /** True when this point does not connect to the previous one. */
  gap: boolean
  /** When the aircraft left this piece of trail behind; null while it is still attached. */
  orphaned: number | null
}

/** An offset in EPSG:3857 meters. */
export interface ContrailOffset {
  x: number
  y: number
}

export interface ContrailTrail {
  points: ContrailPoint[]
  /** When the last point was recorded; null while no contrail is forming. */
  lastSample: number | null
  /** Opacity of fresh trail, from how favourable the air is for contrails. */
  strength: number
  /** How far the aircraft is drawn from its guess while it glides after a miss. */
  glide: ContrailOffset
  /** The latest bend: points laid from `since` to `at` follow the glide in proportion, later ones (and all, without a bend) fully. */
  bend: { since: number; at: number } | null
}

const NO_GLIDE: ContrailOffset = { x: 0, y: 0 }

/** Estimated upper-level wind, in ground meters per second towards east and north. */
export interface ContrailWind {
  east: number
  north: number
  speed: number
}

/** A trail point as it looks at `now`, in EPSG:3857 meters. */
export interface ContrailVertex {
  x: number
  y: number
  /** Width in EPSG:3857 meters. */
  width: number
  /** 0 when the trail was just laid down, 1 when it has dissolved. */
  progress: number
  /** Opacity relative to a fresh trail. */
  opacity: number
  gap: boolean
}

/** EPSG:3857 meters per ground meter at a Mercator `y`. */
export function mercatorScaleAt(y: number) {
  return Math.cosh(y / EARTH_RADIUS_METERS)
}

/** Estimated upper-level wind from the observer's surface reading; `directionDeg` is where it blows from. */
export function upperLevelWind(surfaceSpeedMs: number, directionDeg: number): ContrailWind {
  const speed = Math.max(0, surfaceSpeedMs || 0) * UPPER_WIND_FACTOR
  const toRad = (((directionDeg || 0) + 180) * Math.PI) / 180
  return { east: Math.sin(toRad) * speed, north: Math.cos(toRad) * speed, speed }
}

export function createContrailTrail(): ContrailTrail {
  return { points: [], lastSample: null, strength: 0, glide: NO_GLIDE, bend: null }
}

/** How much of the glide a point laid at `born` follows under `bend`. */
function bendWeight(bend: { since: number; at: number } | null, born: number) {
  if (!bend || born >= bend.at) return 1
  return Math.min(1, Math.max(0, (born - bend.since) / Math.max(1, bend.at - bend.since)))
}

/** Where a point is drawn before wind and ageing: moved along with the gliding aircraft. */
function glidedPosition(trail: ContrailTrail, point: ContrailPoint): ContrailOffset {
  if (point.orphaned !== null) return point
  const weight = bendWeight(trail.bend, point.born)
  return { x: point.x + trail.glide.x * weight, y: point.y + trail.glide.y * weight }
}

/**
 * Adds the aircraft's guessed position (`x`, `y`) to its trail when a sample is due.
 * `glide` is how far the aircraft is drawn from that guess. `forming` is false while
 * the air is too warm or dry for a contrail; the next point after such a stretch
 * starts a new piece.
 */
export function sampleContrail(
  trail: ContrailTrail, x: number, y: number, now: number, forming: boolean, strength: number, glide: ContrailOffset = NO_GLIDE,
) {
  if (!forming) trail.lastSample = null
  else if (trail.lastSample === null || now - trail.lastSample >= CONTRAIL_SAMPLE_INTERVAL_MS) {
    const previous = trail.points[trail.points.length - 1]
    const step = previous ? Math.hypot(x - previous.x, y - previous.y) / mercatorScaleAt(y) : 0
    // A position jump leaves the piece being laid behind, and orphaning it starts a new one. A piece
    // that ended because the air stopped forming a trail stays, however far the aircraft has flown since.
    if (trail.lastSample !== null && step > CONTRAIL_MAX_STEP_METERS) orphanContrail(trail, now)
    const gap = !previous || trail.lastSample === null
    trail.points.push({ x, y, born: now, distance: gap ? 0 : previous.distance + step, gap, orphaned: null })
    trail.lastSample = now
    trail.strength = strength
  }
  trail.glide = glide
}

/**
 * A new report found the guess off by `miss` (the pose on screen minus the new
 * guess), a guess shown since `since`. Moves the trail onto the corrected track:
 * a point laid when that guess began stays, the newest moves by the whole miss, and
 * those between move in proportion. Call it before sampling the new guess; the
 * aircraft's glide then eases the drawn trail over.
 */
export function bendContrail(trail: ContrailTrail, miss: ContrailOffset, since: number, now: number) {
  const bend = { since, at: now }
  for (const point of trail.points) {
    if (point.orphaned !== null) continue
    const drawn = glidedPosition(trail, point)
    const weight = bendWeight(bend, point.born)
    point.x = drawn.x - miss.x * weight
    point.y = drawn.y - miss.y * weight
  }
  trail.bend = bend
  trail.glide = miss
}

/** Fixes every point where it is drawn now, so a trail no longer following an aircraft stays put. */
function settleContrail(trail: ContrailTrail) {
  if (trail.glide.x === 0 && trail.glide.y === 0) {
    trail.bend = null
    return
  }
  for (const point of trail.points) {
    const drawn = glidedPosition(trail, point)
    point.x = drawn.x
    point.y = drawn.y
  }
  trail.glide = NO_GLIDE
  trail.bend = null
}

/**
 * Marks the newest piece of trail as left behind, because the aircraft turned up
 * somewhere else or is no longer shown. It dissolves within
 * `CONTRAIL_ORPHAN_FADE_MS` instead of lingering where no aircraft is; the next
 * sample starts a new piece.
 */
export function orphanContrail(trail: ContrailTrail, now: number) {
  settleContrail(trail)
  for (let index = trail.points.length - 1; index >= 0; index--) {
    const point = trail.points[index]
    if (point.orphaned !== null) break
    point.orphaned = now
    if (point.gap) break
  }
  trail.lastSample = null
}

const isDissolved = (point: ContrailPoint, now: number) =>
  now - point.born >= CONTRAIL_LIFE_MS || (point.orphaned !== null && now - point.orphaned >= CONTRAIL_ORPHAN_FADE_MS)

/** Drops dissolved points; returns whether anything is left. */
export function pruneContrail(trail: ContrailTrail, now: number): boolean {
  let kept = 0
  let droppedPrevious = false
  for (const point of trail.points) {
    if (isDissolved(point, now)) {
      droppedPrevious = true
      continue
    }
    if (droppedPrevious) point.gap = true
    droppedPrevious = false
    trail.points[kept++] = point
  }
  trail.points.length = kept
  return kept > 0
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** How far a trail can reach beyond its recorded points, in EPSG:3857 meters, for culling. */
export function contrailReach(wind: ContrailWind, mercatorScale: number) {
  const lifeS = CONTRAIL_LIFE_MS / 1000
  const width = CONTRAIL_INITIAL_WIDTH_METERS + (2 + 0.15 * wind.speed) * lifeS
  return (wind.speed * lifeS + BREAKUP_AMPLITUDE_METERS * 2.5 + width) * mercatorScale
}

/**
 * Where each point of a trail is at `now` and how it looks. Points drift with the
 * wind and widen (faster in stronger wind), thinning as they spread; in the second
 * half of their life they ripple sideways and break into separate puffs before
 * fading out.
 */
export function layoutContrail(trail: ContrailTrail, now: number, wind: ContrailWind): ContrailVertex[] {
  if (trail.points.length === 0) return []
  const gliding = trail.glide.x !== 0 || trail.glide.y !== 0
  const points = gliding ? trail.points.map(point => ({ ...point, ...glidedPosition(trail, point) })) : trail.points
  const scale = mercatorScaleAt(points[points.length - 1].y)
  const windFactor = Math.min(1.5, wind.speed / 25)
  const spreadRate = 2 + 0.15 * wind.speed
  const vertices: ContrailVertex[] = []
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    const ageMs = Math.max(0, now - point.born)
    const progress = Math.min(1, ageMs / CONTRAIL_LIFE_MS)
    const ageS = ageMs / 1000

    // The trail's local direction, for the sideways ripple.
    const before = index > 0 && !point.gap ? points[index - 1] : point
    const after = index + 1 < points.length && !points[index + 1].gap ? points[index + 1] : point
    const dx = after.x - before.x
    const dy = after.y - before.y
    const length = Math.hypot(dx, dy)
    const nx = length > 0 ? -dy / length : 0
    const ny = length > 0 ? dx / length : 0
    const phase = (2 * Math.PI * point.distance) / BREAKUP_WAVELENGTH_METERS
    const ripple = smoothstep(0.3, 1, progress) * BREAKUP_AMPLITUDE_METERS * (1 + windFactor) * Math.sin(phase)

    const widthMeters = CONTRAIL_INITIAL_WIDTH_METERS + spreadRate * ageS
    const dilution = Math.sqrt(CONTRAIL_INITIAL_WIDTH_METERS / widthMeters)
    const breakup = smoothstep(0.4, 0.9, progress)
    const puffs = 0.5 + 0.5 * Math.cos(phase)
    const fade = 1 - Math.pow(progress, 1.4)
    const orphanFade = point.orphaned === null ? 1 : 1 - smoothstep(0, CONTRAIL_ORPHAN_FADE_MS, now - point.orphaned)
    vertices.push({
      x: point.x + (wind.east * ageS + nx * ripple) * scale,
      y: point.y + (wind.north * ageS + ny * ripple) * scale,
      width: widthMeters * scale,
      progress,
      opacity: Math.max(0, fade * orphanFade * dilution * (1 - breakup + breakup * puffs * puffs)),
      gap: point.gap,
    })
  }
  return vertices
}
