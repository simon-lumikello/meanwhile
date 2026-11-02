import { describe, expect, it } from 'bun:test'
import {
  CONTRAIL_LIFE_MS,
  CONTRAIL_ORPHAN_FADE_MS,
  CONTRAIL_SAMPLE_INTERVAL_MS,
  bendContrail,
  createContrailTrail,
  layoutContrail,
  mercatorScaleAt,
  orphanContrail,
  pruneContrail,
  sampleContrail,
  upperLevelWind,
  type ContrailTrail,
} from '../src/contrails'
import { latLonToWebMercator } from '../src/mercator'

const start = latLonToWebMercator(61, 25)
const scale = mercatorScaleAt(start.y)
const CALM = upperLevelWind(0, 0)

/** A jet flying east at 230 m/s for `durationMs`, sampled every frame. */
function flyEast(durationMs: number, t0 = 1_000_000): ContrailTrail {
  const trail = createContrailTrail()
  for (let t = 0; t <= durationMs; t += 16) {
    sampleContrail(trail, start.x + 230 * (t / 1000) * scale, start.y, t0 + t, true, 0.4)
  }
  return trail
}

describe('contrails', () => {
  it('records one point per sample interval, not per frame', () => {
    const trail = flyEast(10_000)
    // Samples land on the first frame after each interval, so frame timing may drop one.
    expect(trail.points.length).toBeGreaterThanOrEqual(10_000 / CONTRAIL_SAMPLE_INTERVAL_MS - 1)
    expect(trail.points.length).toBeLessThanOrEqual(10_000 / CONTRAIL_SAMPLE_INTERVAL_MS + 1)
    expect(trail.points[0].gap).toBe(true)
    expect(trail.points.slice(1).every(point => !point.gap)).toBe(true)
  })

  it('lives about twice as long as the old 40–55 s particles', () => {
    expect(CONTRAIL_LIFE_MS).toBeGreaterThanOrEqual(1.5 * 47_500)
    expect(CONTRAIL_LIFE_MS).toBeLessThanOrEqual(2 * 47_500)
  })

  it('lays out in map meters, so the camera cannot change a trail', () => {
    // layoutContrail takes no camera: the same trail at the same moment has one shape at every zoom.
    const trail = flyEast(30_000)
    const newestPoint = trail.points[trail.points.length - 1]
    const first = layoutContrail(trail, newestPoint.born, upperLevelWind(8, 270))
    const again = layoutContrail(trail, newestPoint.born, upperLevelWind(8, 270))
    expect(again).toEqual(first)
    // Fresh trail sits where the aircraft flew.
    const newest = first[first.length - 1]
    expect(newest.x).toBeCloseTo(newestPoint.x, 6)
    expect(newest.y).toBeCloseTo(newestPoint.y, 6)
  })

  it('drifts downwind by the estimated upper-level wind times its age', () => {
    const trail = flyEast(1_000)
    const wind = upperLevelWind(10, 0) // from the north: blows south at 30 m/s aloft
    const later = layoutContrail(trail, 1_000_000 + 20_000, wind)
    const drift = (later[0].y - trail.points[0].y) / scale
    // The ripple has not started this early, so the drift is pure wind.
    expect(drift).toBeCloseTo(-30 * 20, 0)
    expect(Math.abs(later[0].x - trail.points[0].x) / scale).toBeLessThan(1)
  })

  it('widens and thins as it ages, faster in stronger wind', () => {
    const trail = flyEast(60_000)
    const now = 1_060_000
    const calm = layoutContrail(trail, now, CALM)
    const windy = layoutContrail(trail, now, upperLevelWind(12, 200))
    const oldest = calm[0]
    const newest = calm[calm.length - 1]
    expect(oldest.width).toBeGreaterThan(newest.width)
    expect(oldest.opacity).toBeLessThan(newest.opacity)
    expect(windy[0].width).toBeGreaterThan(oldest.width)
  })

  it('breaks into puffs before dissolving instead of fading evenly', () => {
    const trail = flyEast(20_000)
    const late = layoutContrail(trail, 1_000_000 + CONTRAIL_LIFE_MS * 0.75, CALM)
    const opacities = late.map(vertex => vertex.opacity)
    expect(Math.max(...opacities)).toBeGreaterThan(Math.min(...opacities) * 3)
  })

  it('starts a new piece after a gap in formation or a position jump', () => {
    const trail = createContrailTrail()
    sampleContrail(trail, start.x, start.y, 0, true, 0.4)
    sampleContrail(trail, start.x + 100 * scale, start.y, 500, true, 0.4)
    sampleContrail(trail, start.x + 200 * scale, start.y, 1_000, false, 0)
    sampleContrail(trail, start.x + 300 * scale, start.y, 1_500, true, 0.4)
    sampleContrail(trail, start.x + 10_000 * scale, start.y, 2_000, true, 0.4)
    expect(trail.points.map(point => point.gap)).toEqual([true, false, true, true])
    // Only the piece the jump left behind is orphaned; one that ended in dry air stays.
    expect(trail.points.map(point => point.orphaned)).toEqual([null, null, 2_000, null])
  })

  it('dissolves a piece left behind by a jump within seconds, keeping the rest', () => {
    const trail = flyEast(10_000, 0)
    const count = trail.points.length
    orphanContrail(trail, 10_000)
    sampleContrail(trail, start.x + 50_000 * scale, start.y, 10_500, true, 0.4)
    const fading = layoutContrail(trail, 10_000 + CONTRAIL_ORPHAN_FADE_MS / 2, CALM)
    const fresh = layoutContrail(flyEast(10_000, 0), 10_000 + CONTRAIL_ORPHAN_FADE_MS / 2, CALM)
    expect(fading[count - 1].opacity).toBeLessThan(fresh[count - 1].opacity * 0.6)
    expect(pruneContrail(trail, 10_000 + CONTRAIL_ORPHAN_FADE_MS)).toBe(true)
    expect(trail.points).toHaveLength(1)
    expect(trail.points[0].gap).toBe(true)
    expect(trail.points[0].orphaned).toBeNull()
  })

  describe('after a report corrects the guess', () => {
    const SPEED = 230
    const MISS_NORTH = 400
    /** On a frame, as reports are seen. */
    const REPORT_AT = 16 * 940
    const GLIDE = 4_000
    const glideLeft = (t: number) => Math.max(0, 1 - (t - REPORT_AT) / GLIDE)

    /**
     * A jet guessed to fly due east, which a report at REPORT_AT shows is really
     * MISS_NORTH meters further north; the aircraft on screen then glides north
     * over GLIDE. Returns the trail and each frame's drawn trail.
     */
    function correctedFlight(untilMs: number) {
      const trail = createContrailTrail()
      const drawn: { t: number; vertices: ReturnType<typeof layoutContrail> }[] = []
      for (let t = 0; t <= untilMs; t += 16) {
        const east = start.x + SPEED * (t / 1000) * scale
        const corrected = t >= REPORT_AT
        // Shown pose minus the new guess: the full miss at the report, gliding to nothing.
        const glide = corrected ? { x: 0, y: -MISS_NORTH * scale * glideLeft(t) } : { x: 0, y: 0 }
        if (t === REPORT_AT) bendContrail(trail, { x: 0, y: -MISS_NORTH * scale }, 0, t)
        sampleContrail(trail, east, start.y + (corrected ? MISS_NORTH * scale : 0), t, true, 0.4, glide)
        drawn.push({ t, vertices: layoutContrail(trail, t, CALM) })
      }
      return { trail, drawn }
    }

    const northOf = (vertex: { y: number }) => (vertex.y - start.y) / scale

    it('lays the trail along the straight line between the reports, with no sideways step', () => {
      const { trail, drawn } = correctedFlight(REPORT_AT + GLIDE + 10_000)
      const vertices = drawn[drawn.length - 1].vertices
      expect(northOf(vertices[0])).toBeCloseTo(0, 6)
      // The point laid just before the report now sits on the corrected track.
      const beforeReport = trail.points.findLastIndex(point => point.born < REPORT_AT)
      expect(northOf(vertices[beforeReport])).toBeGreaterThan(MISS_NORTH * 0.95)
      // Steepest sideways slope between neighbours: the whole miss spread over the stretch since the
      // last report, rather than squeezed into the few seconds the aircraft glided.
      const slopes = vertices.slice(1).map((vertex, index) => Math.abs(vertex.y - vertices[index].y) / Math.abs(vertex.x - vertices[index].x))
      expect(Math.max(...slopes)).toBeLessThan((MISS_NORTH / (SPEED * REPORT_AT / 1000)) * 1.2)
    })

    it('does not move the drawn trail at the moment of the report, then eases it over', () => {
      const { drawn } = correctedFlight(REPORT_AT + GLIDE + 1_000)
      const reportFrame = drawn.findIndex(frame => frame.t >= REPORT_AT)
      const before = drawn[reportFrame - 1].vertices
      const at = drawn[reportFrame].vertices
      for (let index = 0; index < before.length; index++) {
        expect(at[index].x).toBeCloseTo(before[index].x, 3)
        expect(at[index].y).toBeCloseTo(before[index].y, 3)
      }
      // Halfway through the glide the newest trail is about halfway to the corrected track.
      const midway = drawn.find(frame => frame.t >= REPORT_AT + GLIDE / 2)!.vertices
      expect(northOf(midway[midway.length - 1])).toBeGreaterThan(MISS_NORTH * 0.4)
      expect(northOf(midway[midway.length - 1])).toBeLessThan(MISS_NORTH * 0.6)
    })

    it('stays where it is drawn when the aircraft is lost mid-glide', () => {
      const { trail, drawn } = correctedFlight(REPORT_AT + GLIDE / 2)
      const shown = drawn[drawn.length - 1].vertices
      orphanContrail(trail, REPORT_AT + GLIDE / 2)
      const after = layoutContrail(trail, REPORT_AT + GLIDE / 2, CALM)
      for (let index = 0; index < shown.length; index++) {
        expect(after[index].x).toBeCloseTo(shown[index].x, 3)
        expect(after[index].y).toBeCloseTo(shown[index].y, 3)
      }
    })
  })

  it('drops dissolved points and reports when nothing is left', () => {
    const trail = flyEast(10_000, 0)
    expect(pruneContrail(trail, 5_000 + CONTRAIL_LIFE_MS)).toBe(true)
    expect(trail.points[0].gap).toBe(true)
    expect(pruneContrail(trail, 10_001 + CONTRAIL_LIFE_MS)).toBe(false)
  })
})
