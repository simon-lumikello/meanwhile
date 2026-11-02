import { RADAR_GLSL, VIEW_GLSL } from './cloudShaders'
import { CLOUD_VISUAL_TUNING as t, CLOUD_VOLUME_TUNING as v } from './cloudVisualTuning'

// GLSL requires decimal points for float literals, including owner-entered integers.
const f = (value: number) => Number.isInteger(value) ? value.toFixed(1) : String(value)
const v3 = (color: readonly number[]) => `vec3(${color.map(f).join(', ')})`

/** Edge length, in voxels, of the tileable 3D billow noise. */
export const NOISE_SIZE = 64
/** Most dome sizes drawn at once (see TOPS_FS). */
export const MAX_DOME_SIZES = 8

// Fullscreen quad, with v_uv.y growing downwards like the screen (as VS_SOURCE).
export const VOLUME_VS = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Tileable billow noise, rendered once into a 3D texture one slice at a time: |gradient
// noise| makes rounded puffs separated by thin creases, and three octaves give puffs on
// puffs. Periodic in every axis, so the texture repeats without seams.
export const NOISE_FS = `#version 300 es
precision highp float;
precision highp int;
uniform float u_slice;
out vec4 o;

uint hash(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v.x ^ v.y ^ v.z;
}

vec3 gradient(vec3 cell, float period) {
  uint h = hash(uvec3(mod(cell, period)));
  float a = float(h & 65535u) / 65535.0 * 6.2831853;
  float z = float(h >> 16u) / 65535.0 * 2.0 - 1.0;
  float r = sqrt(1.0 - z * z);
  return vec3(r * cos(a), r * sin(a), z);
}

float periodicNoise(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 fr = p - i;
  vec3 u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  float n = 0.0;
  for (int c = 0; c < 8; c++) {
    vec3 corner = vec3(float(c & 1), float((c >> 1) & 1), float(c >> 2));
    vec3 w = mix(1.0 - u, u, corner);
    n += dot(gradient(i + corner, period), fr - corner) * w.x * w.y * w.z;
  }
  return n;
}

void main() {
  vec3 p = vec3(gl_FragCoord.xy, u_slice) / ${f(NOISE_SIZE)};
  float s = 0.0;
  float a = 0.6;
  for (int octave = 0; octave < 3; octave++) {
    float period = 4.0 * exp2(float(octave));
    float n = min(1.0, abs(periodicNoise(p * period, period)) * 2.2);
    s += a * n * (2.0 - n);
    a *= 0.5;
  }
  o = vec4(s / 1.05);
}
`

// Pass 1: radar coverage over the field (the viewport and a margin for light rays), at low
// resolution. r: white-cloud density, g: rain coverage, b: storm coverage, a: rain nearby,
// over a wider radius. Frames morph and slide along the wind like the classic renderer's.
// Where clouds and rain are is read over ground distances, so it stays put while zooming;
// 'rain nearby' only colours and thins the clouds, so white clouds shade gradually into
// rain clouds instead of meeting them on a line.
export const COVERAGE_FS = `
precision highp float;
${VIEW_GLSL}
uniform vec2 u_advection;
uniform float u_nearbyRadius;
${RADAR_GLSL}

float rainNearby(sampler2D tex, vec2 w) {
  float rain = 0.0;
  float total = 0.0;
  for (int i = 0; i < 16; i++) {
    float r = sqrt((float(i) + 0.5) / 16.0);
    float theta = float(i) * 2.39996323;
    float weight = exp(-2.0 * r * r);
    float d = getRadarDensity(texture2D(tex, clamp(radarUv(w + vec2(cos(theta), sin(theta)) * r * u_nearbyRadius), 0.0, 1.0)));
    rain += smoothstep(${f(t.rain.moistureStart)}, ${f(t.rain.moistureFull)}, d) * weight;
    total += weight;
  }
  return rain / total;
}

void main() {
  vec2 w = worldPosition();
  // The wider support field must not repeat border echoes outside the supplied frame.
  vec2 uv = radarUv(w);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 wPrev = w - u_advection * u_morph;
  vec2 wNext = w + u_advection * (1.0 - u_morph);
  float white = mix(smoothstep(0.0, 0.6, samplePrevious(wPrev)), smoothstep(0.0, 0.6, sampleNext(wNext)), u_morph);
  vec2 precipPrev = rainPrevious(wPrev);
  vec2 precipNext = rainNext(wNext);
  float rain = mix(deckEnvelope(precipPrev.x), deckEnvelope(precipNext.x), u_morph);
  float storm = mix(deckEnvelope(precipPrev.y), deckEnvelope(precipNext.y), u_morph);
  float nearby = mix(u_morph >= 1.0 ? 0.0 : rainNearby(u_texPrev, wPrev), u_morph <= 0.0 ? 0.0 : rainNearby(u_texNext, wNext), u_morph);
  // Rain itself is always fully near rain, however small the shower; around it, the share
  // of rain over the wider radius fades out into the dry clouds.
  gl_FragColor = vec4(white, rain, storm, max(rain, smoothstep(0.0, 0.5, nearby)));
}
`

// Shared by the tops and march passes.
const FIELD_GLSL = `
// Top-left corner and size of the field, in world meters (y north).
uniform vec2 u_fieldOrigin;
uniform vec2 u_fieldSize;
// The same for the radar coverage, which covers the field on a grid fixed to the ground.
uniform vec2 u_coverageOrigin;
uniform vec2 u_coverageSize;
// Viewport height, and the height the tops are stored against, in meters.
uniform float u_span;
// Regional weather scale in projected meters, independent of camera zoom.
uniform float u_regionRadius;
uniform float u_zTop;
// Billow noise: cell size of the finer of two octaves (the coarser is twice that), the
// coarser one's weight, and the finer one's absolute index, as in worldNoise.
uniform float u_cell;
uniform float u_levelT;
uniform float u_level;
// Wind drift of the procedural detail, in meters; and the boil clock, in boil periods.
uniform vec2 u_drift;
uniform float u_boil;

vec2 fieldUv(vec2 w) {
  return vec2((w.x - u_fieldOrigin.x) / u_fieldSize.x, 1.0 - (u_fieldOrigin.y - w.y) / u_fieldSize.y);
}

vec2 coverageUv(vec2 w) {
  return vec2((w.x - u_coverageOrigin.x) / u_coverageSize.x, 1.0 - (u_coverageOrigin.y - w.y) / u_coverageSize.y);
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
`

// Pass 2: how high the clouds reach over each point of the field, at low resolution.
// r: cloud top over u_zTop, g: unused, b: footprint, a: regional coverage.
// Regional echoes guide a single cloud body; ground-anchored structure shapes its outline.
// Domes raise its top: rounded caps on grids anchored
// to the ground, each size twice the last, added together, so small domes sit on large
// ones like a cauliflower. A size fades in once its domes are large enough to see and out
// once they outgrow the view. Their support retains a regional scale at close zoom, so
// refining the visible relief cannot break the cloud body apart.
export const TOPS_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_coverage;
// Meters per canvas pixel, the smallest dome size drawn (a power of two times the smallest
// dome), and how many sizes.
uniform float u_pixelMeters;
uniform float u_firstDome;
uniform int u_domeSizes;
// The broad cloud body retains this modelling span when zooming closer.
uniform float u_bodySpan;
${FIELD_GLSL}

// The coverage averaged over areas about 2^lod texels wide, smoothly. Mipmap levels are box
// averages over square blocks, and read with linear filtering their block edges show as a
// grid of straight steps in whatever they size; a cubic B-spline over the level (four
// bilinear reads) has no such edges.
vec4 coverageAround(vec2 uv, float lod) {
  float level = max(0.0, floor(lod));
  vec2 size = vec2(textureSize(u_coverage, int(level)));
  vec2 x = uv * size - 0.5;
  vec2 i = floor(x);
  vec2 f = x - i;
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = 1.0 - g0;
  vec2 h0 = (i - 0.5 + w1 / g0) / size;
  vec2 h1 = (i + 1.5 + w3 / g1) / size;
  return g0.y * (g0.x * textureLod(u_coverage, h0, level) + g1.x * textureLod(u_coverage, vec2(h1.x, h0.y), level))
    + g1.y * (g0.x * textureLod(u_coverage, vec2(h0.x, h1.y), level) + g1.x * textureLod(u_coverage, h1, level));
}

// A dome size's weight within a modelling span. The body keeps a regional span;
// visible relief uses the viewport span so large domes never tower over a close view.
float sizeWeight(float cell, float span) {
  float pixels = cell / u_pixelMeters;
  return smoothstep(${f(v.smallestDomePixels)}, ${f(2 * v.smallestDomePixels)}, pixels)
    * (1.0 - smoothstep(0.25 * span, 0.5 * span, cell));
}

float gradientNoise(vec2 q);

// Domes of one size at p: x, the smooth maximum of rounded caps over the 3x3 cells around
// p, about 0 to 1 (up to the storm height), before scaling by the dome's height; y, the
// tallest of the same domes as gentle mounds, which fall to nothing at their rim instead of
// ending on a wall, for scalloping the cloud's edge without cutting it sharply. Each dome
// is sized by the coverage under its centre, and swells and settles on its own phase.
vec2 domes(vec2 p, float cell, float salt) {
  float coverageTexel = u_coverageSize.x / float(textureSize(u_coverage, 0).x);
  // Each size's grid is turned by its own angle, so domes never line up in rows along the
  // map's axes, nor with the sizes above and below them.
  float angle = salt * 2.3999632;
  mat2 turn = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  vec2 q = turn * (p - u_drift) / cell;
  vec2 i = floor(q);
  const float K = 6.0;
  float s = 0.0;
  float mound = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 id = i + vec2(float(x), float(y));
    vec2 h = hash2(id + salt);
    vec2 centre = transpose(turn) * ((id + h) * cell) + u_drift;
    // Sized by the coverage under its centre, but no larger than the cloud or rain around it
    // supports, averaged over the dome's own width: zoomed out, the largest domes span
    // hundreds of kilometres, and a small shower under one would otherwise stand as tall as
    // a wide rain area, a steep-walled block cut out of a dome sized elsewhere.
    vec4 cover = min(textureLod(u_coverage, coverageUv(centre), 0.0),
      ${f(v.domeSupport)} * coverageAround(coverageUv(centre), log2(cell / coverageTexel)));
    // One family of domes for all cloud: precipitation never switches material.
    if (fract(h.x * 11.71 + h.y * 5.93) < ${f(v.domeGaps)}) continue;
    float pick = fract(h.x * 7.13 + h.y * 3.7);
    float variety = mix(${f(v.domeVariety)}, 1.0, pick * pick);
    float phase = fract(h.y * 5.31);
    float swell = 0.9 + 0.1 * sin((u_boil + phase) * 6.2831853);
    float size = max(smoothstep(0.02, 0.65, cover.r), cover.b);
    size *= variety * swell;
    if (size <= 0.01) continue;
    float r = size * ${f(v.domeRadius)} * cell;
    vec2 d = p - centre;
    float rr = dot(d, d) / (r * r);
    if (rr >= 1.0) continue;
    // Uneven, broad lobes replace the circular foot exposed at close zoom. Read noise
    // around the rim, not across the surface: each ray stays connected to the core and
    // only the outskirts narrow. The bounded radius keeps the neighbouring-cell search valid.
    vec2 rimDirection = turn * d / max(length(d), 0.001);
    vec2 seed = h * 37.0 + salt;
    float rimRadius = clamp(0.88 + 0.5 * gradientNoise(rimDirection * 1.4 + seed)
      + 0.18 * gradientNoise(rimDirection * 3.8 - seed), 0.55, 1.0);
    rr /= mix(1.0, rimRadius * rimRadius, smoothstep(0.35, 0.8, rr));
    if (rr >= 1.0) continue;
    // The flared foot still falls gently to nothing, and the rounded core stays intact.
    float t = 1.0 - rr;
    float cap = sqrt(t) * t * (2.0 - t) * size * mix(1.0, ${f(v.stormHeight)}, cover.b);
    s += exp(K * cap) - 1.0;
    mound = max(mound, (1.0 - rr) * size);
  }
  return vec2(log(1.0 + s) / K, mound);
}

// Gradient noise (about -0.7 to 0.7) over unit cells. Value noise would show its square
// cells as straight edges and rectangles; gradient noise hides its grid.
float gradientNoise(vec2 q) {
  vec2 i = floor(q);
  vec2 f = q - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash2(i) * 2.0 - 1.0, f);
  float b = dot(hash2(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// How thick the white cloud grows at p (thinnest to 1): regions of towering cumulus and of
// thinner cloud, which the billows carve into broken, translucent patches. Fixed to the
// ground; each octave's grid is turned off the map's axes so nothing lines up with them.
float thickness(vec2 p) {
  const mat2 turn1 = mat2(0.825, 0.565, -0.565, 0.825);
  const mat2 turn2 = mat2(-0.416, 0.909, -0.909, -0.416);
  float n = 0.65 * gradientNoise(turn1 * p / ${f(v.thicknessScale)})
    + 0.35 * gradientNoise(turn2 * p / ${f(v.thicknessScale / 2)} + 3.7);
  return mix(${f(v.thinnest)}, 1.0, smoothstep(-0.4, 0.4, n));
}

void main() {
  vec2 p = u_fieldOrigin + vec2(v_uv.x * u_fieldSize.x, -v_uv.y * u_fieldSize.y);
  vec4 cover = textureLod(u_coverage, coverageUv(p), 0.0);
  // Read a regional context as well as the local envelope. It describes a broken
  // field or a continuous deck; the procedural cloud surface supplies the outline.
  float texel = u_coverageSize.x / float(textureSize(u_coverage, 0).x);
  vec4 regional = coverageAround(coverageUv(p), log2(u_regionRadius / texel));
  vec2 bend = vec2(gradientNoise(p / u_regionRadius),
    gradientNoise(p / u_regionRadius + 13.7)) * u_regionRadius * 0.65;
  cover.r = mix(textureLod(u_coverage, coverageUv(p + bend), 0.0).r, regional.r, 0.25);
  // Height in meters, and dome support averaged over the sizes drawn (0 to about 1).
  float white = 0.0;
  float support = 0.0;
  float lumps = 0.0;
  float weights = 0.0;
  for (int i = 0; i < ${MAX_DOME_SIZES}; i++) {
    if (i >= u_domeSizes) break;
    float level = u_firstDome + float(i);
    float cell = ${f(v.smallestDome)} * exp2(level);
    float weight = sizeWeight(cell, u_bodySpan);
    if (weight <= 0.001) continue;
    vec2 whiteDomes = domes(p, cell, level * 17.0);
    // Heights grow more slowly than sizes, so small domes still stand out on large ones.
    float height = cell * ${f(v.domeHeight)} * pow(cell / (0.25 * u_bodySpan), ${f(-v.domeHeightFalloff)});
    support += weight * whiteDomes.x * height;
    // Large domes keep supporting the footprint after their relief leaves the view.
    // Only the visible relief changes size; it cannot open holes in that body.
    float visibleWeight = sizeWeight(cell, u_span);
    float reliefHeight = cell * ${f(v.domeHeight)} * pow(cell / (0.25 * u_span), ${f(-v.domeHeightFalloff)});
    white += visibleWeight * whiteDomes.x * reliefHeight;
    lumps += weight * whiteDomes.y;
    weights += weight;
  }
  lumps /= max(weights, 0.001);
  // The same rounded, broken surface shapes dry and precipitating cloud. Regional
  // coverage lowers its formation threshold: sparse echoes make separate puffs,
  // widespread echoes merge into a deck. Neither contour traces individual radar cells.
  float structure = 0.5 + 0.85 * gradientNoise(p / (u_regionRadius * 0.8))
    + 0.3 * gradientNoise(p / (u_regionRadius * 0.3) + 7.3);
  float cloudAmount = max(cover.r, mix(regional.g, cover.g, 0.5));
  float whiteFootprint = smoothstep(-0.12, 0.16,
    structure + lumps * 0.25 - mix(${f(v.formationThreshold[0])}, ${f(v.formationThreshold[1])}, cloudAmount))
    * smoothstep(0.015, 0.18, cloudAmount);
  // Continuous regional echoes support the hollows as well as the domes. Surface
  // noise shapes their relief instead of opening a repeated pattern of clear holes.
  float interior = smoothstep(0.25, 0.65, regional.r) * smoothstep(0.08, 0.25, cover.r);
  whiteFootprint = max(whiteFootprint, 0.9 * interior);
  whiteFootprint = max(whiteFootprint, 0.95 * smoothstep(0.03, 0.7, cover.g));
  // Rounded domes already describe cloud interiors. Keep their full silhouette there;
  // the breakup field only shapes thin outskirts instead of stamping the dome surface.
  float domeInterior = smoothstep(0.0, 0.01 * u_bodySpan, support);
  whiteFootprint = mix(whiteFootprint, smoothstep(0.015, 0.18, cloudAmount), domeInterior);
  // A continuous supporting body and rounded tops, identical for dry and rainy cloud.
  // Coverage changes its thickness smoothly; rain never adds a second raised silhouette.
  // Preserve the broad domes' optical thickness as their visible relief fades out.
  // Their height scales with the view for shading, but their ground footprint stays put.
  // A thin outer rim must not lose its mass just because its parent dome outgrows the view.
  // Limit the retained body to the surface band's depth so fine domes keep their relief.
  float baseAmount = smoothstep(0.05, 0.5, cloudAmount);
  float weakBase = 1.0 - smoothstep(0.8, 1.0, baseAmount * whiteFootprint);
  float retainedBody = min(support * u_span / u_bodySpan, ${f(v.surface)} * u_span) * weakBase;
  white = max(white, retainedBody);
  float base = ${f(v.whiteBase)} * u_span * baseAmount;
  float cloudTop = whiteFootprint * (white + base) * thickness(p)
    * mix(0.65, 1.0, smoothstep(0.1, 0.8, regional.r));
  o = vec4(min(cloudTop / u_zTop, 1.0), 0.0, whiteFootprint, cloudAmount);
}
`

// Pass 3: the raymarch, at reduced resolution. The view ray falls straight down (the map is
// seen from above) from the cloud top; each sample looks towards the sun or moon for how
// much cloud is in the way (Beer-Lambert with a multiple-scattering tail and a powder
// term), and takes skylight by how open it is to the sky. Billows carve the tops into puffs.
// Out: premultiplied cloud colour, and the clouds' shadow on the ground they leave visible.
export const MARCH_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tops;
uniform sampler3D u_noise;
uniform sampler2D u_coverage;
uniform vec2 u_viewOrigin;
uniform vec2 u_viewSize;
// The previous frame's clouds and where its view was, for temporal accumulation; its weight
// (0 without history), and the frame count, which moves the sample jitter every frame.
uniform sampler2D u_history;
uniform vec2 u_historyOrigin;
uniform vec2 u_historySize;
uniform float u_historyWeight;
uniform float u_frame;
// Towards the light, world axes (y north), z raised so rays stay short at low sun.
uniform vec3 u_lightDir;
// The night light (the moon, or the fixed night light without one), and the night sky, used
// while u_sunLit is 0.
uniform vec3 u_lightColor;
uniform vec3 u_skyColor;
// 1 while the sun or its twilight lights the clouds, which then take their light and sky
// colour from the sun's elevation over each point, with the night light fading in as the sun
// goes down: at the world origin (x, in degrees) plus its change per meter (yz, y north).
uniform float u_sunLit;
uniform vec3 u_sunPlane;
uniform float u_shadowStrength;
uniform float u_exposure;
uniform int u_viewSteps;
uniform int u_lightSteps;
// Radii, in meters, of the few pixels and the few dozen over which clouds fade out at their
// edge (see CLOUD_VOLUME_TUNING.edgeFadePixels).
uniform vec2 u_edgeRadius;
${FIELD_GLSL}

float octaveNoise(vec3 p, float cell, float level) {
  // The texture spans 4 puffs of its coarsest octave.
  vec3 offset = fract(vec3(level * 0.371, level * 0.613, level * 0.237) + 0.5);
  vec3 q = vec3(p.xy - u_drift, p.z) * (${f(v.billowsPerCell)} / (4.0 * cell));
  // Fine billows use an oblique slice through the tile instead of repeating the same
  // horizontal slice along the map axes. A rigid rotation keeps puff size and noise
  // contrast intact. Leave regional billows alone; each octave keeps its orientation
  // across zooms, including when it changes from the finer to the coarser slot.
  const mat3 turn = mat3(
    0.87260657, 0.42492740, -0.24082045,
    -0.38572942, 0.90200505, 0.19390644,
    0.29961742, -0.07631250, 0.95100253);
  if (cell < u_regionRadius) q = turn * q;
  return texture(u_noise, q + offset + vec3(0.0, 0.0, u_boil * 0.25)).r;
}

float billows(vec3 p) {
  return mix(octaveNoise(p, u_cell, u_level), octaveNoise(p, u_cell * 2.0, u_level + 1.0), u_levelT);
}

// r: cloud top (meters), g: unused, b: footprint, a: regional coverage.
vec4 topsAt(vec2 xy) {
  vec4 t = texture(u_tops, fieldUv(xy));
  return vec4(t.rg * u_zTop, t.ba);
}

// Density (0..1) at p under the tops t. Billows carve the band just under each top into
// puffs; deeper down the cloud is solid. Towards the edge of a cloud,
// including around holes in it, the billows carve deeper, density rises more gently, and
// the cloud thins, fraying it into translucent wisps and shreds.
float density(vec3 p, vec4 t) {
  float below = t.r - p.z;
  if (p.z < 0.0 || below <= 0.0) return 0.0;
  float band = ${f(v.surface)} * u_span;
  float fray = 1.0 - t.b;
  float erosion = ${f(v.erode)} * (1.0 + ${f(v.edgeFray)} * fray);
  float sharpness = ${f(v.sharpness)} * mix(1.0, ${f(v.edgeSoftness)}, fray);
  float d = (below / band - (1.0 - billows(p)) * erosion) * sharpness;
  return clamp(d, 0.0, 1.0) * mix(${f(v.edgeOpacity)}, 1.0, smoothstep(0.0, 0.8, t.b));
}

// How much of the ground within 'radius' meters of w has cloud over it, however thin (0 to
// 1): about half on the cloud's edge, all of it once the edge is 'radius' away.
float cloudAround(vec2 w, float radius) {
  float s = 0.0;
  for (int i = 0; i < 12; i++) {
    float r = sqrt((float(i) + 0.5) / 12.0);
    float theta = float(i) * 2.39996323;
    vec4 t = texture(u_tops, fieldUv(w + vec2(cos(theta), sin(theta)) * r * radius));
    s += step(0.0001, t.r);
  }
  return s / 12.0;
}

float sunElevation(vec2 w) {
  return u_sunPlane.x + dot(w, u_sunPlane.yz);
}

// Sunlight reaching height z over ground that sees the sun at elevation e (degrees). A cloud
// sees past the ground's horizon by its dip; 0.833 degrees more is refraction and the sun's
// radius, so light arrives until the sun's centre is that far down. Light grazing the
// horizon crosses the most air, so it is the reddest and dimmest.
vec3 sunlight(float e, float z) {
  float altitude = mix(${f(v.cloudAltitude[0])}, ${f(v.cloudAltitude[1])}, clamp(z / u_zTop, 0.0, 1.0));
  float seen = e + degrees(sqrt(2.0 * altitude / 6371000.0)) + 0.833;
  vec3 c = mix(${v3(v.sunHorizonColor)}, ${v3(v.sunLowColor)}, smoothstep(0.0, 5.0, seen));
  c = mix(c, ${v3(v.sunColor)}, smoothstep(5.0, ${f(v.sunDayElevation)}, seen));
  return c * ${f(v.sunIntensity)} * smoothstep(0.0, 1.5, seen);
}

// The sky's fill at a point whose ground sees the sun at elevation e (degrees).
vec3 skylight(float e) {
  vec3 c = mix(${v3(v.nightSkyColor)}, ${v3(v.duskSkyColor)}, smoothstep(${f(v.twilightEnd)}, -3.0, e));
  c = mix(c, ${v3(v.twilightSkyColor)}, smoothstep(-3.0, 3.0, e));
  return mix(c, ${v3(v.skyColor)}, smoothstep(5.0, 18.0, e));
}

// Share of the night light at a point whose ground sees the sun at elevation e (degrees): none
// while the sun lights the clouds, all of it where the night takes over, so the clouds never
// go dark between the last sunlight and the night.
float nightShare(float e) {
  return 1.0 - smoothstep(${f(v.twilightEnd)}, ${f(v.nightLightFrom)}, e);
}

// A random phase (0 to 1) for a pixel, uncorrelated with its neighbours' (PCG hash).
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

float pixelPhase(uvec2 p) {
  return float(pcg(p.x + pcg(p.y)) >> 8u) / 16777216.0;
}

// Optical depth from p towards the light, in extinction units. 'jitter' (0 to 1) staggers
// the first step per pixel, so step boundaries on a curved cloud never line up into rings.
float lightDepth(vec3 p, float sigma, float jitter) {
  float od = 0.0;
  float stepLen = 0.012 * u_span;
  vec3 lp = p - u_lightDir * stepLen * jitter;
  for (int j = 0; j < 8; j++) {
    if (j >= u_lightSteps) break;
    lp += u_lightDir * stepLen;
    if (lp.z > u_zTop) break;
    od += density(lp, topsAt(lp.xy)) * stepLen;
    stepLen *= 1.6;
  }
  return od * sigma;
}

void main() {
  vec2 w = u_viewOrigin + vec2(v_uv.x * u_viewSize.x, -v_uv.y * u_viewSize.y);
  float sigma = ${f(v.extinction)} / u_span;
  float band = ${f(v.surface)} * u_span;
  vec4 t = topsAt(w);
  float top = t.r;

  // r: white density, g: rain, b: storm, a: rain nearby (see COVERAGE_FS).
  vec4 cover = textureLod(u_coverage, coverageUv(w), 0.0);
  float T = 1.0;
  vec3 col = vec3(0.0);
  bool sunLit = u_sunLit > 0.5;
  float sunE = sunElevation(w);
  vec3 skyColor = sunLit ? skylight(sunE) : u_skyColor;
  if (top > 0.0) {
    // The same number of steps through every column, so thin cloud at an edge is sampled as
    // finely as it needs and does not break into grain.
    float dz = max(top / float(u_viewSteps), 0.001 * u_span);
    // Phase: light scattered from the sun or moon towards the viewer above.
    float g = 0.3;
    float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * u_lightDir.z, 1.5) * 0.25 + 0.375;
    // Per-pixel jitter turns step terraces into fine grain, and moving it every frame lets
    // the accumulation below average the grain away. Each pixel starts from an unrelated
    // phase: a phase that varies smoothly across the screen (interleaved gradient noise)
    // leaves its near-vertical stripes in what the accumulation has not yet averaged, and the
    // shared per-frame step slides them sideways.
    float jitter = fract(pixelPhase(uvec2(gl_FragCoord.xy)) + u_frame * 0.618034);
    // The ray starts at this point's cloud top: billows only carve below it.
    float z = top - jitter * dz;
    for (int i = 0; i < 160; i++) {
      if (z <= 0.0 || T < 0.02) break;
      vec3 p = vec3(w, z);
      float d = density(p, t);
      if (d > 0.002) {
        float tau = lightDepth(p, sigma, jitter);
        // Beer-Lambert, plus a tail of light scattered many times, which keeps shaded
        // sides blue-grey instead of black.
        float sunT = exp(-tau) * 0.6 + exp(-tau * 0.2) * 0.4;
        float powder = 1.0 - exp(-d * sigma * dz * 6.0);
        // Skylight by how deep under the cloud top the point lies.
        float sky = mix(1.0, 0.4, smoothstep(0.0, 3.0 * band, top - z));
        vec3 light = sunLit ? sunlight(sunE, z) + u_lightColor * nightShare(sunE) : u_lightColor;
        vec3 S = light * sunT * hg * mix(0.6, 1.0, powder) + skyColor * sky;
        // Cloud in and near rain scatters less, and bluer: the more rain around, and the lower
        // in the cloud, the more. It follows the smooth 'rain nearby', not which layer is
        // drawn, so white clouds shade gradually into rain clouds. Storms darken it further.
        float rainTint = cover.a * mix(1.0, ${f(v.rainTopTint)}, smoothstep(0.0, top, z));
        S *= mix(vec3(1.0), ${v3(v.rainTint)}, rainTint) * mix(vec3(1.0), ${v3(v.stormTint)}, cover.b);
        float Ti = exp(-d * sigma * dz);
        col += T * S * (1.0 - Ti);
        T *= Ti;
      }
      z -= dz;
    }
  }

  // Clouds fade out to nothing at their edge, at every zoom: zoomed out, the radar's edge
  // spans only a few pixels (rain, with no faint echoes around it, ends abruptly), so the
  // cloud would stop on a hard line. They fade in over a few pixels from the edge, then over
  // a few dozen, broken up by the billows into wisps; clouds too small for the wider fade
  // stay translucent. The fade starts on the edge itself, where half the ground around is
  // cloud, since the cloud ends there and nothing outside it is left to fade.
  float edgeCover = 1.0;
  if (top > 0.0) {
    float near = cloudAround(w, u_edgeRadius.x);
    float far = cloudAround(w, u_edgeRadius.y);
    far -= 2.0 * (1.0 - far) * (1.0 - billows(vec3(w, 0.5 * top))) * ${f(v.edgeFadeWisps)};
    edgeCover = smoothstep(0.5, 1.0, near) * mix(${f(v.smallCloudOpacity)}, 1.0, smoothstep(0.5, 1.0, far));
  }
  float alpha = (1.0 - T) * edgeCover;
  T = 1.0 - alpha;

  // Cloud shadow on the ground the clouds leave visible: each cloud casts one, its own shape,
  // from the cloud a fixed height up towards the light. Marching the whole ray found every
  // cloud along it, far off at low sun, and its widening steps drew a small cloud's shadow
  // several times over, the copies sliding apart while zooming.
  // The ground loses the sun before the clouds do, so their shadows fade out at sunset.
  float shadowStrength = u_shadowStrength * (sunLit ? smoothstep(-1.0, 0.5, sunE) : 1.0);
  float shadow = 0.0;
  if (T > 0.02 && shadowStrength > 0.001) {
    vec2 reach = u_lightDir.xy / u_lightDir.z * ${f(v.shadowHeight)} * u_span;
    vec2 caster = w + reach * min(1.0, ${f(v.shadowReach)} * u_span / max(length(reach), 0.001));
    vec4 ct = topsAt(caster);
    float thickness = ct.r;
    if (thickness > 0.0) {
      // The caster's column, sampled at three heights, faded at its edge like the cloud.
      float d = 0.0;
      for (int k = 0; k < 3; k++) d += density(vec3(caster, thickness * (float(k) + 0.5) / 3.0), ct);
      float tau = d / 3.0 * thickness * sigma;
      // Fade the ground shadow across the same cloud edge.
      float edge = smoothstep(0.5, 1.0, cloudAround(caster, u_edgeRadius.x));
      shadow = (1.0 - exp(-tau * 0.5)) * edge * shadowStrength * ${f(v.groundShadow)};
    }
  }

  col = col / (1.0 + col * 0.25) * u_exposure * edgeCover;
  col = min(col, vec3(alpha));
  vec3 shadowColor = vec3(0.015, 0.025, 0.05);
  o = vec4(col + shadowColor * shadow * T, alpha + shadow * T);

  // Temporal accumulation: blend with what the previous frame drew on the same ground. The
  // view looks straight down, so a pixel's ground position finds it exactly while panning
  // and zooming; the clouds themselves change slowly.
  vec2 previous = vec2((w.x - u_historyOrigin.x) / u_historySize.x, (u_historyOrigin.y - w.y) / u_historySize.y);
  if (u_historyWeight > 0.0 && all(greaterThan(previous, vec2(0.0))) && all(lessThan(previous, vec2(1.0)))) {
    o = mix(o, texture(u_history, vec2(previous.x, 1.0 - previous.y)), u_historyWeight);
  }
}
`

// Pass 4: the raymarched clouds, upscaled onto the canvas.
export const COMPOSITE_FS = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_clouds;
void main() {
  gl_FragColor = texture2D(u_clouds, vec2(v_uv.x, 1.0 - v_uv.y));
}
`
