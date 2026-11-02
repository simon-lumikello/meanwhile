import { getSolarPosition, getSolarTimes, type getCelestialLightSource } from '@simon-lumikello/meanwhile-weather/core'
import { CLOUD_VOLUME_TUNING } from './cloudVisualTuning'
import type { RadarCloudLighting } from './types'
import type { Vec3, VolumeFrame } from './volumetricClouds'

/**
 * The moment the clouds are lit as, and where the sun stands then. 'time-of-day' is the real
 * time; 'noon' is the day's solar noon, with the sun raised to full daylight where it stays
 * low at noon (winter in the north), so the clouds never take on sunset colours.
 */
export function cloudLightingSun(lighting: RadarCloudLighting, now: Date, latitude: number, longitude: number) {
  if (lighting !== 'noon') return { date: now, ...getSolarPosition(now, latitude, longitude) }
  // Sunrise and sunset sit symmetrically about solar noon, even when the sun never rises or sets.
  const { sunrise, sunset } = getSolarTimes(now, latitude, longitude)
  const date = new Date((sunrise.getTime() + sunset.getTime()) / 2)
  const { azimuth, elevation } = getSolarPosition(date, latitude, longitude)
  return { date, azimuth, elevation: Math.max(elevation, CLOUD_VOLUME_TUNING.sunDayElevation) }
}

type CelestialLight = ReturnType<typeof getCelestialLightSource>
export type VolumeLight = 'lightDir' | 'lightColor' | 'skyColor' | 'sunLit' | 'sunPlane' | 'shadowStrength' | 'exposure'

/** Ground meters in one degree of arc across the Earth's surface. */
const METERS_PER_DEGREE = 111195
const EARTH_RADIUS_METERS = 6371000
/** The sun's ground shadow strength at the horizon (see getCelestialLightSource), kept through twilight. */
const HORIZON_SHADOW_STRENGTH = 0.336
/**
 * Sun elevation, in degrees, below which the clouds are lit as at night throughout. The sunlit
 * path draws the night too (all night light and night sky past the twilight's end), per point,
 * so it hands over only once the whole view is well past twilight, even zoomed out over all of
 * Finland; the two then match.
 */
export const NIGHT_ELEVATION = -18
/** Degrees past `NIGHT_ELEVATION` over which moon shadows fade in; twilight faded the shadows out. */
const MOON_SHADOW_FADE_DEGREES = 3

/**
 * Sun elevation, in degrees, at which the highest cloud loses the sun: it sees past the
 * horizon by its dip, plus refraction and the sun's radius (see `sunlight` in the shader).
 */
export const LAST_SUNLIGHT_ELEVATION = -(Math.sqrt(2 * CLOUD_VOLUME_TUNING.cloudAltitude[1] / EARTH_RADIUS_METERS) * 180 / Math.PI + 0.833)

/** Where the sun is for the observer, and where the observer is: relative to the frame anchor, in EPSG:3857 meters. */
export interface SunView {
  azimuth: number
  elevation: number
  latitude: number
  x: number
  y: number
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const normalize = (x: number, y: number, z: number): Vec3 => {
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}

/**
 * Turns unit vector `a` towards `b` by the share `t` of the angle between them, at an even
 * pace: a sun setting in the west and a moon rising in the east are almost opposite, and a
 * straight blend would whip the light across the sky halfway.
 */
function turnTowards(a: Vec3, b: Vec3, t: number): Vec3 {
  const cos = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const angle = Math.acos(cos)
  if (angle < 1e-4) return b
  // Opposite vectors have no single arc between them; turn over the zenith.
  const [bx, by, bz] = angle > Math.PI - 1e-3 ? normalize(b[0], b[1], b[2] + 1e-2) : b
  const sin = Math.sin(angle)
  const wa = Math.sin((1 - t) * angle) / sin
  const wb = Math.sin(t * angle) / sin
  return normalize(a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb)
}

/**
 * The light at night, towards it in world axes (y north): the moon when it is up, never
 * dimmer than the night light, which otherwise falls from high above.
 */
export function nightLight(celestial: CelestialLight): { dir: Vec3; color: Vec3 } {
  const v = CLOUD_VOLUME_TUNING
  // Map-space light has y pointing south. A low moon is raised: raking light crosses whole
  // clouds and leaves them dark and grainy.
  const [lx, ly, lz] = celestial.type === 'sun' ? [0, 0, 1] : celestial.lightDir
  const strength = Math.max(v.nightLight, celestial.type === 'moon' ? celestial.shadowStrength * 2.5 : 0)
  const [r, g, b] = v.moonColor
  const horizontal = Math.hypot(lx, ly)
  const z = Math.max(v.nightLightLowest, lz)
  const scale = horizontal > 1e-6 ? Math.sqrt(1 - z * z) / horizontal : 0
  return { dir: normalize(lx * scale, -ly * scale, horizontal > 1e-6 ? z : 1), color: [r * strength, g * strength, b * strength] }
}

/**
 * A volumetric frame lit by the sun through the day and its twilight, then by the night light.
 * The night light fades in through twilight and turns the light towards itself once no cloud
 * sees the sun, so the clouds never go black between the two and the handover is seamless.
 */
export function volumeFrame(frame: Omit<VolumeFrame, VolumeLight>, celestial: CelestialLight,
  sun: SunView, isDark: boolean): VolumeFrame {
  const v = CLOUD_VOLUME_TUNING
  const exposure = isDark ? v.darkExposure : 1
  const night = nightLight(celestial)
  if (sun.elevation > NIGHT_ELEVATION) {
    const azimuth = sun.azimuth * Math.PI / 180
    // Low sun is raised so rays through the volume stay short; the shader colours the light
    // by the sun's real elevation.
    const lz = Math.max(v.lowestLight, Math.sin(Math.max(0, sun.elevation) * Math.PI / 180))
    const horizontal = Math.sqrt(1 - lz * lz)
    // Once no cloud sees the sun, the light turns towards the night's, arriving as the night light
    // is full: left low on the sun's side, it would cross the clouds and leave them dark and grainy.
    const toNight = smoothstep(LAST_SUNLIGHT_ELEVATION, v.twilightEnd, sun.elevation)
    // The sun stands a degree higher for every degree of arc towards it; a Mercator meter
    // spans cos(latitude) meters of ground.
    const perMeter = Math.cos(sun.latitude * Math.PI / 180) / METERS_PER_DEGREE
    const east = Math.sin(azimuth) * perMeter
    const north = Math.cos(azimuth) * perMeter
    return {
      ...frame,
      lightDir: turnTowards([Math.sin(azimuth) * horizontal, Math.cos(azimuth) * horizontal, lz], night.dir, toNight),
      // The shader fades it in by each point's sun elevation.
      lightColor: night.color,
      skyColor: v.skyColor,
      sunLit: true,
      sunPlane: [sun.elevation - east * sun.x - north * sun.y, east, north],
      shadowStrength: celestial.type === 'sun' ? celestial.shadowStrength : HORIZON_SHADOW_STRENGTH,
      exposure,
    }
  }
  return {
    ...frame,
    lightDir: night.dir,
    lightColor: night.color,
    skyColor: v.nightSkyColor,
    sunLit: false,
    sunPlane: [0, 0, 0],
    shadowStrength: celestial.type === 'moon'
      ? celestial.shadowStrength * smoothstep(NIGHT_ELEVATION, NIGHT_ELEVATION - MOON_SHADOW_FADE_DEGREES, sun.elevation)
      : 0,
    exposure,
  }
}
