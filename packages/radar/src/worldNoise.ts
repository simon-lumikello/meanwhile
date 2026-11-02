/**
 * Zoom-continuous procedural noise, anchored to the ground.
 *
 * Screen-space noise slides against the map while zooming, and noise at a fixed
 * world frequency turns to grain when zoomed out. Instead, every octave lives at
 * a fixed world frequency, and the set of visible octaves shifts with zoom: the
 * coarsest octave fades in as you zoom out and the finest fades out, weighted by
 * where each octave sits relative to the viewport. An octave keeps the same
 * weight, rotation, and offset across a level boundary, so the pattern is
 * continuous at every zoom and every pan.
 */

/** Viewport heights are grouped into power-of-two levels from this base length. */
const LEVEL_BASE_METERS = 1000
/** Per-octave rotation of the classic fbm (atan(0.6 / 0.8)) and a decorrelating offset. */
const OCTAVE_ROTATION = Math.atan2(0.6, 0.8)
const OCTAVE_OFFSET = [5.31, -1.73] as const
export const NOISE_OCTAVE_SLOTS = 5

export interface NoiseLevel {
  /** World meters that map to one unit of level coordinates. */
  levelMeters: number
  /** Position between this level and the next (0 at `levelMeters`, 1 at twice that). */
  t: number
  /** Per slot: cos, sin, offsetX, offsetY for the octave in that slot. */
  octaves: Float32Array
}

/** Noise level for a viewport that is `spanMeters` tall. */
export function computeNoiseLevel(spanMeters: number): NoiseLevel {
  const level = Math.log2(Math.max(1, spanMeters) / LEVEL_BASE_METERS)
  const base = Math.floor(level)
  const octaves = new Float32Array(NOISE_OCTAVE_SLOTS * 4)
  for (let slot = 0; slot < NOISE_OCTAVE_SLOTS; slot++) {
    // Octave identity is absolute, so a slot's transform follows its octave across levels.
    const absolute = slot - base
    const angle = absolute * OCTAVE_ROTATION
    octaves.set([Math.cos(angle), Math.sin(angle), absolute * OCTAVE_OFFSET[0], absolute * OCTAVE_OFFSET[1]], slot * 4)
  }
  return { levelMeters: LEVEL_BASE_METERS * 2 ** base, t: level - base, octaves }
}

/** GLSL: simplex noise plus zoom-continuous fbm over world-meter coordinates. */
export const WORLD_NOISE_GLSL = `
uniform float u_levelMeters;
uniform float u_levelT;
uniform vec4 u_octave[${NOISE_OCTAVE_SLOTS}];

// 2D Simplex Noise (Ashima Arts / Stefan Gustavson): isotropic, C1 continuous
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,  // (3.0-sqrt(3.0))/6.0
    0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
   -0.577350269189626,  // -1.0 + 2.0 * C.x
    0.024390243902439   // 1.0 / 41.0
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec2 octaveCoord(vec4 octave, vec2 p) {
  return vec2(octave.x * p.x - octave.y * p.y, octave.y * p.x + octave.x * p.y) + octave.zw;
}

// Octave slot i sits at screen-octave position x = i - 1 + t: slot 0 fades in over
// x in [-1, 0], the last slot fades out over its final unit, and the octaves in
// between keep the classic 1/2^x amplitude. 'k' is the classic screen frequency
// (per viewport height); 'warp' offsets every octave in its own coordinates.
float zfbm3(vec2 w, float k, vec2 warp) {
  vec2 q = w * (k / u_levelMeters);
  float sum = 0.0;
  float norm = 0.0;
  float scale = 0.5;
  for (int i = 0; i < 4; i++) {
    float x = float(i) - 1.0 + u_levelT;
    float amp = exp2(-x) * clamp(x + 1.0, 0.0, 1.0) * clamp(3.0 - x, 0.0, 1.0);
    sum += amp * snoise(octaveCoord(u_octave[i], q * scale) + warp);
    norm += amp;
    scale *= 2.0;
  }
  // Same range as the classic 3-octave fbm: 0.875 of a unit noise around 0.5.
  return sum / norm * 0.4375 + 0.5;
}

float zfbm4(vec2 w, float k, vec2 warp) {
  vec2 q = w * (k / u_levelMeters);
  float sum = 0.0;
  float norm = 0.0;
  float scale = 0.5;
  for (int i = 0; i < 5; i++) {
    float x = float(i) - 1.0 + u_levelT;
    float amp = exp2(-x) * clamp(x + 1.0, 0.0, 1.0) * clamp(4.0 - x, 0.0, 1.0);
    sum += amp * snoise(octaveCoord(u_octave[i], q * scale) + warp);
    norm += amp;
    scale *= 2.0;
  }
  // Same range as the classic 4-octave fbm: 0.9375 of a unit noise around 0.5.
  return sum / norm * 0.46875 + 0.5;
}

// A single noise octave at screen frequency 'k', cross-faded between the two
// world octaves that bracket it. Contrast is renormalized through the blend.
float zsnoise(vec2 w, float k) {
  vec2 q = w * (k / u_levelMeters);
  float a = u_levelT;
  float b = 1.0 - u_levelT;
  float n = a * snoise(octaveCoord(u_octave[0], q * 0.5)) + b * snoise(octaveCoord(u_octave[1], q));
  return n / sqrt(a * a + b * b);
}
`
