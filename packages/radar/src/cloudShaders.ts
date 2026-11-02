import { CLOUD_VISUAL_TUNING as t } from './cloudVisualTuning'
import { WORLD_NOISE_GLSL } from './worldNoise'

// GLSL requires decimal points for float literals, including owner-entered integers.
const f = (value: number) => Number.isInteger(value) ? value.toFixed(1) : String(value)
const v3 = (color: readonly number[]) => `vec3(${color.map(f).join(', ')})`

// Radar samples per pixel for the rain and storm coverage, spread over `precipitationRadius`:
// more gives smoother deck edges at a proportional cost.
const RAIN_TAPS = 32

// Fullscreen quad vertex shader
export const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  // Map [-1, 1] to [0, 1], with v_uv.y growing downwards like the screen
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Shared by both radar programs. All positions are EPSG:3857 meters relative to
// a fixed anchor, with y pointing north.
export const VIEW_GLSL = `
varying vec2 v_uv;

uniform sampler2D u_texPrev;
uniform sampler2D u_texNext;
uniform float u_morph;
// Top-left corner and size of the viewport.
uniform vec2 u_viewOrigin;
uniform vec2 u_viewSize;
// Top-left corner and size of the radar frame extent.
uniform vec2 u_texOrigin;
uniform vec2 u_texSize;

vec2 worldPosition() {
  return u_viewOrigin + vec2(v_uv.x * u_viewSize.x, -v_uv.y * u_viewSize.y);
}

vec2 radarUv(vec2 w) {
  return vec2((w.x - u_texOrigin.x) / u_texSize.x, (u_texOrigin.y - w.y) / u_texSize.y);
}
`

// Radar sampling shared by the classic cloud shader and the volumetric coverage pass:
// density from a radar frame's colour, the smoothed density that shapes white clouds, and
// rain and storm coverage over a fixed ground radius. Needs VIEW_GLSL.
export const RADAR_GLSL = `
uniform float u_blurRadius;
// Fixed ground radius, in meters, that rain and storm read the radar over.
uniform float u_rainRadius;

// Continuous, differentiable radar density extraction without hard step thresholds.
// Frames are premultiplied (see CloudRadarCanvas), so filtered cell edges keep their colour.
float getRadarDensity(vec4 premultiplied) {
  // Alpha threshold: smooth taper instead of a hard cliff edge
  float alphaWeight = smoothstep(0.02, 0.18, premultiplied.a);
  if (alphaWeight <= 0.001) return 0.0;
  vec4 c = vec4(premultiplied.rgb / premultiplied.a, premultiplied.a);

  // Reject dark noise / sub-threshold artifacts
  float maxCh = max(c.r, max(c.g, c.b));
  float minCh = min(c.r, min(c.g, c.b));
  float brightnessWeight = smoothstep(0.02, 0.15, maxCh);

  // Reject neutral gray (FMI OPERA no-data areas have color around 189, 189, 189)
  float saturation = maxCh - minCh;
  float satWeight = smoothstep(0.02, 0.08, saturation);

  // Smooth classifier responses across weather color palettes:
  // 1. Severe thunderstorm / downpour (Red / Crimson)
  float severe = smoothstep(0.35, 0.80, c.r) * smoothstep(0.45, 0.15, c.b) * smoothstep(0.0, 0.2, c.r - c.g);
  // 2. Heavy rain (Yellow / Orange: c.r & c.g prominent, c.b low)
  float heavy = smoothstep(0.45, 0.80, c.r) * smoothstep(0.25, 0.65, c.g) * smoothstep(0.45, 0.15, c.b);
  // 3. Moderate rain (Green / Lime: c.g prominent)
  float moderate = smoothstep(0.30, 0.70, c.g) * smoothstep(0.70, 0.35, c.r);
  // 4. Light rain & drizzle (Cyan / Sky Blue / Dark Blue: c.b prominent, c.r low)
  float light = smoothstep(0.04, 0.45, c.b) * smoothstep(0.60, 0.20, c.r);
  // 5. Trace clouds / virga (Purple / Magenta / Lavender: c.r & c.b both high)
  float trace = smoothstep(0.25, 0.70, c.b) * smoothstep(0.25, 0.65, c.r);

  float rawDensity =
      severe * 0.96 +
      heavy * 0.86 +
      moderate * 0.75 +
      light * 0.62 +
      trace * 0.45;

  // Normalize by total active weight if multiple overlap
  float totalWeight = severe + heavy + moderate + light + trace;
  float density = totalWeight > 0.01 ? (rawDensity / max(1.0, totalWeight)) : 0.0;

  // FMI's all-clouds 'radar_rate' ramp runs from lavender (0.01 mm/h) through periwinkle
  // to cyan (5 mm/h) with blue near full and red falling as the rate rises. The classes
  // above read all of it as trace, so light rain never reached the rain layer. Along
  // that stretch, density follows red instead: white-cloud density below 0.2 mm/h, rain
  // from there, moderate by 5 mm/h. Saturated palettes never match it.
  if (c.b > 0.85 && c.g < 0.85 && c.r > 0.3) {
    float r = c.r * 255.0;
    if (r >= 177.0) density = mix(0.40, 0.34, clamp((r - 177.0) / 52.0, 0.0, 1.0)); // 0.1 → 0.01
    else if (r >= 151.0) density = mix(0.62, 0.40, (r - 151.0) / 26.0);             // 0.5 → 0.1
    else if (r >= 130.0) density = mix(0.66, 0.62, (r - 130.0) / 21.0);             // 1 → 0.5
    else if (r >= 108.0) density = mix(0.71, 0.66, (r - 108.0) / 22.0);             // 2.5 → 1
    else density = mix(0.75, 0.71, clamp((r - 86.0) / 22.0, 0.0, 1.0));             // 5 → 2.5
  }

  return density * alphaWeight * brightnessWeight * satWeight;
}

// Multi-scale atmospheric diffusion using a deterministic Vogel spiral
// This eliminates geometric ghosting and banding from the blocky 1km radar grid
// while retaining the fine procedural cloud detail. The weighted mean shapes the white
// clouds; its radius follows the viewport, so they stay broad and fluffy at every zoom.
float sampleSmoothRadar(sampler2D tex, vec2 w) {
  float density = 0.0;
  float totalWeight = 0.0;

  // 64-tap Vogel spiral with a fixed start angle: no per-pixel dithering or banding.
  const float GOLDEN_ANGLE = 2.39996323;

  for (int i = 0; i < 64; i++) {
    float r = sqrt(float(i) + 0.5) / 8.0; // 8.0 is sqrt(64.0)
    float theta = float(i) * GOLDEN_ANGLE;
    vec2 offset = vec2(cos(theta), sin(theta)) * r * u_blurRadius;

    // Gaussian-like falloff towards the edges of the blur kernel
    float weight = exp(-3.0 * r * r);

    density += getRadarDensity(texture2D(tex, clamp(radarUv(w + offset), 0.0, 1.0))) * weight;
    totalWeight += weight;
  }

  return density / totalWeight;
}

// Rain and storm read the radar over a fixed ground radius instead: each tap is classed as
// rain (or storm) or not, and the weighted share of rainy taps is the rain's coverage of
// the ground around the pixel. It crosses one half on the radar's own edge and ramps over
// the same ground distance at every zoom, whether clear sky or faint echoes lie beyond,
// and a shower about one radar cell across still reaches past one half at its centre.
// Half the white clouds' taps: the radius is only a couple of radar cells.
// x: rain coverage. y: storm coverage.
vec2 sampleRainCoverage(sampler2D tex, vec2 w) {
  vec2 coverage = vec2(0.0);
  float totalWeight = 0.0;
  const float GOLDEN_ANGLE = 2.39996323;

  for (int i = 0; i < ${RAIN_TAPS}; i++) {
    float r = sqrt((float(i) + 0.5) / ${f(RAIN_TAPS)});
    float theta = float(i) * GOLDEN_ANGLE;
    vec2 offset = vec2(cos(theta), sin(theta)) * r * u_rainRadius;
    float weight = exp(-3.0 * r * r);

    float d = getRadarDensity(texture2D(tex, clamp(radarUv(w + offset), 0.0, 1.0)));
    coverage += vec2(
      smoothstep(${f(t.rain.moistureStart)}, ${f(t.rain.moistureFull)}, d),
      smoothstep(${f(t.storm.moistureStart)}, ${f(t.storm.moistureFull)}, d)
    ) * weight;
    totalWeight += weight;
  }

  return coverage / totalWeight;
}

// A deck's envelope from its coverage: it starts where the first rainy cells come within
// the radius, about a radius outside the radar's edge, and is full a little inside it, so
// its frayed edge straddles the radar's over a couple of kilometres of ground.
float deckEnvelope(float coverage) {
  return smoothstep(0.02, 0.6, coverage);
}

// 1 across the edge band, where some of the ground around is dry; 0 in the solid interior.
float deckFringe(float coverage) {
  return 1.0 - smoothstep(0.5, 0.97, coverage);
}

// Endpoint branches are uniform across the draw. The omitted sample contributes
// exactly zero to every mix, including the nonlinear cloud and severity envelopes.
// Keep the full kernel for both frames during a transition.
float samplePrevious(vec2 w) {
  if (u_morph >= 1.0) return 0.0;
  return sampleSmoothRadar(u_texPrev, w);
}

float sampleNext(vec2 w) {
  if (u_morph <= 0.0) return 0.0;
  return sampleSmoothRadar(u_texNext, w);
}

vec2 rainPrevious(vec2 w) {
  if (u_morph >= 1.0) return vec2(0.0);
  return sampleRainCoverage(u_texPrev, w);
}

vec2 rainNext(vec2 w) {
  if (u_morph <= 0.0) return vec2(0.0);
  return sampleRainCoverage(u_texNext, w);
}
`

// Photorealistic procedural top-down satellite cloud shader with Beer-Lambert optical depth
// and real-time celestial sun/moon shadow casting on the terrain basemap. Clouds are
// anchored to the ground: every position is in world meters, and procedural detail
// comes from zoom-continuous noise, so zooming and panning never make them slide or pop.
export const FS_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

${VIEW_GLSL}
${WORLD_NOISE_GLSL}

uniform float u_isNight;
// World-space vectors, in meters.
uniform vec2 u_drift;
uniform vec2 u_shadowOffset;
uniform vec2 u_advection;
uniform float u_shadowStrength;
uniform vec3 u_lightDir;

${RADAR_GLSL}

// A cloud deck above the white clouds (rain or storm), built the way the white clouds are:
// a macro / meso / micro fractal volume from the deck's own noise, turned into optical
// density above a threshold the envelope lowers. The fractal lobes give it a fluffy edge
// rather than a fade; a weak envelope forms only sparse cloudlets, and gaps remain even
// at full moisture. k is the macro billow frequency per viewport height; 'offset'
// decorrelates decks on the ground; 'boil' scales how fast its billows churn relative to
// the white clouds'; 'edge' is 1 across a band just inside the deck's edge on the ground.
// Out: density, thickness (0 at the edge), meso billows (for hollows), and the shadow the
// deck casts on the layers beneath it in sun or moonlight.
void cloudDeck(vec2 w, vec2 offset, float k, vec2 warp, float envelope, float coverage, float opticalDepth,
               float boil, float edge, out float density, out float thickness, out float meso, out float shadowBelow) {
  vec2 p = w + offset;
  vec2 drift = u_drift * boil;
  float macro = zfbm4(p - drift * (0.7 / k), k, warp);
  meso = zfbm4(p + drift * (0.5 / (k * 2.0)), k * 2.0, warp * 0.75);
  float micro = zsnoise(p - drift * (0.9 / (k * 4.0)), k * 4.0) * 0.5 + 0.5;
  float volume = macro * 0.60 + meso * 0.30 + micro * 0.10;

  // Near the edge only, fine wisps fray it into shreds and pinholes, so it thins out
  // raggedly over about a radar cell instead of ending on a clean line.
  float fringe = max(1.0 - smoothstep(0.55, 0.95, envelope), edge);
  float fray = 0.5;
  if (fringe > 0.001) {
    fray = (zsnoise(p + drift * (0.6 / (k * 10.0)), k * 10.0) * 0.65
          + zsnoise(p - drift * (0.8 / (k * 22.0)), k * 22.0) * 0.35) * 0.5 + 0.5;
  }

  // The deck's own billows break up its envelope before it sets coverage, so the edge
  // falls where the noise decides, in lobes, shreds, and stray cloudlets, rather than
  // along the radar contour. Full envelopes stay full.
  float breakup = meso * 0.6 + micro * 0.4;
  float broken = clamp(envelope * 1.3 - (1.0 - breakup) * 0.4 + (fray - 0.6) * 1.4 * fringe, 0.0, 1.0);
  float threshold = mix(${f(t.clouds.coverageDry)}, coverage, broken);
  float moisture = max(0.0, volume - threshold);
  float presence = smoothstep(0.0, 0.6, broken);
  // Like the white clouds' dry-to-wet optical depth: thin, translucent wisps in the
  // deck's weak outskirts, thick in its core.
  float depth = mix(opticalDepth * 0.3, opticalDepth, broken);
  // Where the radar is wet, the billows' hollows hold a slightly thinner veil of the deck
  // rather than open sky: hollows follow the viewport, rain must follow the ground.
  float veil = ${f(t.deckVeil)} * smoothstep(0.15, 0.85, broken) * mix(0.6, 1.0, smoothstep(0.3, 0.7, volume));
  density = max(1.0 - exp(-moisture * depth * ${f(t.clouds.opticalExtinction)}), veil) * presence;
  thickness = smoothstep(0.0, 0.25, moisture);

  // The deck's broad mass shifted away from the light, like the white clouds' ground
  // shadow and scaled by the same sun or moon strength; soft, so it never outlines the deck.
  shadowBelow = 0.0;
  if (u_shadowStrength > 0.001) {
    // Sampled at a lower frequency than the deck: the broad mass, so the shadow is soft.
    float caster = zfbm3(p - u_shadowOffset * 0.6 - drift * (0.7 / k), k * 0.7, warp) * 0.60 + 0.20;
    shadowBelow = smoothstep(-0.10, 0.14, caster - threshold) * presence * u_shadowStrength;
  }
}

// Lit colour of one layer: 'shade' faces away from the light, 'lit' towards it.
vec3 layerColor(vec3 shade, vec3 lit, vec3 nightShade, vec3 nightLit, float diffuse) {
  return mix(mix(shade, lit, diffuse), mix(nightShade, nightLit, diffuse), u_isNight * 0.65);
}

void main() {
  vec2 w = worldPosition();
  float span = u_viewSize.y;

  // Large-scale atmospheric vortices (breaks up all rectilinear grid alignment)
  vec2 warp1 = vec2(
    zfbm3(w + u_drift * (1.0 / 2.2), 2.2, vec2(0.0)),
    zfbm3(w - u_drift * (1.2 / 2.2), 2.2, vec2(4.1, 2.3))
  );
  vec2 warp2 = vec2(
    zfbm3(w + u_drift * (0.6 / 4.4), 4.4, warp1 * 1.6),
    zfbm3(w - u_drift * (0.5 / 4.4), 4.4, -warp1 * 1.6 + vec2(1.7, 3.8))
  );

  // 1. Evaluate overhead atmospheric moisture potential across frames
  // Gentle domain warping to make the regional envelope sweeping and organic
  vec2 wSample = w + ((warp1 - 0.5) * ${f(t.clouds.envelopeWarpLarge)} + (warp2 - 0.5) * ${f(t.clouds.envelopeWarpSmall)}) * span;

  // Use strict linear morphing for perfectly constant velocity during continuous playback.
  // Smoothstep (S-curve) causes acceleration/deceleration resulting in a "stutter" at keyframes.
  float easedMorph = u_morph;

  // Optical flow advection: move the old frame forward and the new frame backward
  // based on the wind velocity and the time elapsed between the two frames.
  // Using the steering-wind distance forces the two crossfading images
  // to physically slide towards each other, preventing double-vision (caterpillar scrunching).
  vec2 wPrev = wSample - u_advection * u_morph;
  vec2 wNext = wSample + u_advection * (1.0 - u_morph);

  float moisturePrev = samplePrevious(wPrev);
  float moistureNext = sampleNext(wNext);
  float baseMoisture = mix(moisturePrev, moistureNext, easedMorph);

  // 2. Pure Fractal Multi-Octave Cumulus Body Synthesis
  // Tuned for massive, epic, fluffy cumulus systems
  float macroBillows = zfbm4(w - u_drift * (0.7 / 2.8), 2.8, vec2(0.0));
  float mesoBillows = zfbm4(w + u_drift * (0.5 / 5.5), 5.5, warp1 * 0.6);
  float microWisps = zsnoise(w - u_drift * (0.9 / 11.0), 11.0) * 0.5 + 0.5;

  float organicCloudVolume = macroBillows * 0.60 + mesoBillows * 0.30 + microWisps * 0.10;

  // CREATIVE LIBERTY:
  // The radar data acts purely as a macro-scale cloud coverage probability map.
  // The actual clouds are 100% organic fractal shapes. This completely decouples the
  // visual cloud boundaries from the blocky 1km radar grid.

  // Calculate envelope linearly to prevent the clouds from bulging/pulsing at the midpoint of the crossfade
  float envPrev = smoothstep(0.0, 0.60, moisturePrev);
  float envNext = smoothstep(0.0, 0.60, moistureNext);
  float envelope = mix(envPrev, envNext, easedMorph);

  // In dry areas (envelope=0), we need high noise (0.80) to form a cloud (sparse fair-weather clouds).
  // In rainy areas (envelope=1), we need very little noise (0.15) to form a cloud (dense storm overcast).
  float coverageThreshold = mix(${f(t.clouds.coverageDry)}, ${f(t.clouds.coverageWet)}, envelope);

  // Primary cloud layer (thick, 3D body)
  float primaryMoisture = max(0.0, organicCloudVolume - coverageThreshold);
  float primaryDensity = 0.0;
  if (primaryMoisture > 0.01) {
    float opticalDepth = primaryMoisture * mix(${f(t.clouds.opticalDepthDry)}, ${f(t.clouds.opticalDepthWet)}, envelope);
    primaryDensity = 1.0 - exp(-opticalDepth * ${f(t.clouds.opticalExtinction)});
  }

  // Secondary transparent cloud layer (wispy tongues, torn away by wind)
  // A fixed ground offset lets the secondary layer peek out asymmetrically
  vec2 secW = w + vec2(4800.0, 3200.0);
  float wispyBillows = zfbm4(secW - u_drift * (0.5 / 4.5), 4.5, vec2(0.0));
  float crispWisps = zsnoise(secW + u_drift * (0.3 / 16.0), 16.0) * 0.5 + 0.5;

  // Blend with organicCloudVolume so they are somewhat correlated, but the unique noise breaks them up
  float secondaryVolume = mix(organicCloudVolume, wispyBillows * 0.6 + crispWisps * 0.4, 0.6);

  // Primary threshold is mix(0.80, 0.15). By making this slightly lower (0.68 in dry),
  // the secondary clouds will naturally extend a bit further out than the primary clouds,
  // allowing them to peek out from underneath without flooding the whole clear sky.
  float secondaryThreshold = mix(0.68, 0.05, envelope);
  // Tighten the smoothstep bounds to reveal fractal fluffiness instead of a uniform blur.
  float secondaryMoisture = smoothstep(secondaryThreshold - 0.02, secondaryThreshold + 0.06, secondaryVolume);

  // Cap secondary density, but introduce spatial variation so it doesn't look flat.
  float opacityVariation = mix(${f(t.clouds.secondaryOpacityMin)}, ${f(t.clouds.secondaryOpacityMax)}, mesoBillows);
  float secondaryDensity = secondaryMoisture * opacityVariation;

  // Rain and storm decks over the white clouds, from the radar's rain and storm coverage
  // over a fixed ground radius, so they show where the radar measured precipitation at
  // every zoom. The billows nudge where it is read by at most about a kilometre of ground:
  // lobed, fluffy edges, never a shower moved or resized. Up close the nudge also stays
  // small beside the billows, which would otherwise fold into thin filaments. Each
  // envelope is shaped per frame and then mixed, like the cloud envelope, so decks never
  // pulse mid-crossfade.
  float edgeWarpMeters = min(${f(t.precipitationEdgeWarp)}, span * 0.03);
  vec2 edgeWarp = (warp2 - 0.5 + vec2(mesoBillows, macroBillows) - 0.5) * edgeWarpMeters;
  vec2 coveragePrev = rainPrevious(w + edgeWarp - u_advection * u_morph);
  vec2 coverageNext = rainNext(w + edgeWarp + u_advection * (1.0 - u_morph));
  float rainEnvelope = mix(deckEnvelope(coveragePrev.x), deckEnvelope(coverageNext.x), easedMorph);
  float rainEdge = mix(deckFringe(coveragePrev.x), deckFringe(coverageNext.x), easedMorph);
  float rainDensity = 0.0;
  float rainThickness = 0.0;
  float rainMeso = 0.0;
  float rainCast = 0.0;
  if (rainEnvelope > 0.001) {
    cloudDeck(w, vec2(-6100.0, 2700.0), ${f(t.rain.billowScale)}, warp1 * 0.8, rainEnvelope, ${f(t.rain.coverage)},
      ${f(t.rain.opticalDepth)}, ${f(t.rain.boil)}, rainEdge, rainDensity, rainThickness, rainMeso, rainCast);
  }

  float stormEnvelope = mix(deckEnvelope(coveragePrev.y), deckEnvelope(coverageNext.y), easedMorph);
  float stormEdge = mix(deckFringe(coveragePrev.y), deckFringe(coverageNext.y), easedMorph);
  float stormDensity = 0.0;
  float stormThickness = 0.0;
  float stormMeso = 0.0;
  float stormCast = 0.0;
  if (stormEnvelope > 0.001) {
    cloudDeck(w, vec2(3900.0, -5200.0), ${f(t.storm.billowScale)}, warp2 * 0.8, stormEnvelope, ${f(t.storm.coverage)},
      ${f(t.storm.opticalDepth)}, ${f(t.storm.boil)}, stormEdge, stormDensity, stormThickness, stormMeso, stormCast);
  }
  float deckShadow = max(rainCast * ${f(t.rain.castShadow)}, stormCast * ${f(t.storm.castShadow)});

  // 3. Ground Cloud Shadow (gentle terrain penumbra)
  float shadowAlpha = 0.0;
  if (u_shadowStrength > 0.001) {
    vec2 casterW = w - u_shadowOffset;
    vec2 shadowWPrev = casterW - u_advection * easedMorph;
    vec2 shadowWNext = casterW + u_advection * (1.0 - easedMorph);

    float casterMoisture = mix(
      samplePrevious(shadowWPrev),
      sampleNext(shadowWNext),
      easedMorph
    );

    // The smoothed radar has lower peak values than raw data.
    // Boost it using the same envelope logic as the primary clouds so shadows match the cloud size.
    casterMoisture = smoothstep(0.0, 0.60, casterMoisture);

    if (casterMoisture > 0.01) {
      float casterNoise = zsnoise(casterW + u_drift * (0.5 / 3.0), 3.0) * 0.5 + 0.5;
      // Simple organic approximation of the volume for the shadow caster
      float casterCover = max(0.0, casterNoise - mix(0.75, 0.20, casterMoisture));
      shadowAlpha = smoothstep(0.01, 0.50, casterCover) * u_shadowStrength * ${f(t.clouds.shadowOpacity)};
    }
  }

  // The decks shade the ground too, where no cloud lies beneath them.
  shadowAlpha = max(shadowAlpha, deckShadow);

  // Early out if completely clear sky and no cast shadow on ground
  float cloudDensity = max(primaryDensity, max(rainDensity, stormDensity));
  if (cloudDensity <= 0.003 && secondaryDensity <= 0.003 && shadowAlpha <= 0.003) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // 4. 3D Volumetric Cloud Shading & Color Grading
  // Secondary (bottom) layer shading
  // Darker and bluer to firmly place them in the shadow of the primary clouds (low altitude scud).
  // If they are too bright, they break the depth illusion and look like high-altitude cirrus over the storm.
  vec3 secDay = vec3(0.45, 0.49, 0.54);
  vec3 secNight = vec3(0.12, 0.16, 0.20);
  vec3 secondaryColor = mix(secDay, secNight, u_isNight * 0.65);
  float secondaryAlpha = secondaryDensity;

  // Composited back to front with premultiplied colour: scud, white, rain, storm.
  vec3 cloudRgb = secondaryColor * secondaryAlpha;
  float cloudAlpha = secondaryAlpha;

  if (cloudDensity > 0.003) {
    float edgeSoftness = smoothstep(0.01, 0.25, cloudDensity);

    // Smooth volumetric billow curvature (macro structure + soft cumulus domes).
    // The finite-difference step follows the viewport so relief reads the same at every zoom.
    vec2 billowW = w - u_drift * (1.0 / 3.4);
    vec2 billowWarp = warp2 * 0.4;
    float eps = (0.024 / 3.4) * span;
    float hC = zfbm3(billowW, 3.4, billowWarp);
    float hX = zfbm3(billowW + vec2(eps, 0.0), 3.4, billowWarp);
    // Screen-down step, matching the light direction's screen frame.
    float hY = zfbm3(billowW - vec2(0.0, eps), 3.4, billowWarp);

    float reliefStrength = mix(0.55, 1.15, smoothstep(0.05, 0.50, baseMoisture)) * edgeSoftness;
    vec3 normal = normalize(vec3(
      (hC - hX) * reliefStrength,
      (hC - hY) * reliefStrength,
      1.25
    ));

    // Dynamic directional lighting oriented towards real Sun or Moon
    vec3 lightDir = normalize(vec3(u_lightDir.xy, max(0.28, u_lightDir.z)));

    // Volumetric wrap diffuse lighting (Half-Lambert)
    float wrap = 0.45;
    float wrappedDiff = max(0.0, (dot(normal, lightDir) + wrap) / (1.0 + wrap));

    // Soft atmospheric forward-scattering sheen
    vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
    float forwardScatter = pow(max(0.0, dot(normal, halfVec)), 3.2) * 0.06 * edgeSoftness * (1.0 - u_isNight * 0.65);

    // Natural ambient occlusion in the deeper hollows between cumulus billows
    float billowAO = mix(0.82, 1.0, smoothstep(0.15, 0.75, mesoBillows));

    // White fair-weather clouds. Alpha follows cloud density, never hard solid.
    float primaryAlpha = clamp(primaryDensity * mix(${f(t.clouds.primaryOpacityMin)}, ${f(t.clouds.primaryOpacityMax)}, smoothstep(0.02, 0.40, baseMoisture)), 0.0, 0.92);
    vec3 whiteColor = layerColor(${v3(t.clouds.shadeColor)}, ${v3(t.clouds.litColor)},
      ${v3(t.clouds.nightShadeColor)}, ${v3(t.clouds.nightLitColor)}, wrappedDiff) * billowAO + forwardScatter;
    cloudRgb = whiteColor * primaryAlpha + cloudRgb * (1.0 - primaryAlpha);
    cloudAlpha = primaryAlpha + cloudAlpha * (1.0 - primaryAlpha);

    // Blue-grey rain deck over the white clouds: it shades them, then covers them. Lit on
    // the same relief as the white clouds, with its own hollows and thicker, brighter middle.
    cloudRgb *= 1.0 - rainCast * ${f(t.rain.castShadow)};
    float rainAO = mix(0.74, 1.0, smoothstep(0.15, 0.75, rainMeso)) * mix(0.94, 1.04, rainThickness);
    float rainAlpha = rainDensity * ${f(t.rain.opacity)};
    vec3 rainColor = layerColor(${v3(t.rain.shadeColor)}, ${v3(t.rain.litColor)},
      ${v3(t.rain.nightShadeColor)}, ${v3(t.rain.nightLitColor)}, wrappedDiff) * rainAO + forwardScatter * 0.5;
    cloudRgb = rainColor * rainAlpha + cloudRgb * (1.0 - rainAlpha);
    cloudAlpha = rainAlpha + cloudAlpha * (1.0 - rainAlpha);

    // Dark storm deck nearest the viewer, over both.
    cloudRgb *= 1.0 - stormCast * ${f(t.storm.castShadow)};
    float stormAO = mix(0.80, 1.0, smoothstep(0.15, 0.75, stormMeso)) * mix(0.96, 1.05, stormThickness);
    float stormAlpha = stormDensity * ${f(t.storm.opacity)};
    vec3 stormColor = layerColor(${v3(t.storm.shadeColor)}, ${v3(t.storm.litColor)},
      ${v3(t.storm.nightShadeColor)}, ${v3(t.storm.nightLitColor)}, wrappedDiff) * stormAO;
    cloudRgb = stormColor * stormAlpha + cloudRgb * (1.0 - stormAlpha);
    cloudAlpha = stormAlpha + cloudAlpha * (1.0 - stormAlpha);
  }

  // 5. Ground Shadow Compositing
  vec3 dayShadow = vec3(0.015, 0.025, 0.05); // Cool slate ambient shadow
  vec3 nightShadow = vec3(0.005, 0.008, 0.018); // Deep obsidian shadow
  vec3 shadowColor = mix(dayShadow, nightShadow, u_isNight);

  // Clouds occlude the shadow on the ground directly underneath them
  float groundShadow = shadowAlpha * (1.0 - cloudAlpha);

  // Premultiplied alpha composite
  vec3 finalRgb = cloudRgb + shadowColor * groundShadow;
  float finalA = clamp(cloudAlpha + groundShadow, 0.0, 1.0);

  gl_FragColor = vec4(finalRgb, finalA);
}
`

/**
 * FMI's 'radar_rate' style (the all-clouds frames) is a continuous pastel ramp in which
 * light rain is nearly the same lavender as non-precipitating echoes, and the faintest
 * echoes fade in from a translucent magenta. The heatmap redraws that ramp in the legend's
 * palette instead: clouds as a faint cool-white mist, rain as one ramp from sky blue
 * through deep blue and violet to rose, coral, and gold for the heaviest downpours.
 * Each entry: FMI stop color (mm/h in the comment), heatmap color, heatmap alpha.
 */
const FMI_RATE_RAMP: readonly (readonly [string, string, number])[] = [
  ['#ff00ff', '#e2ecf8', 0], // 0, fully transparent in the frame
  ['#e5d3f7', '#e2ecf8', 0.18], // 0.01
  ['#cdbff4', '#e2ecf8', 0.26], // 0.05
  ['#b1aff2', '#dbe7f7', 0.34], // 0.1
  // Not an FMI stop: the ramp's color at 0.2, where the rain-only frames start showing rain.
  ['#abadf2', '#8fd0fb', 0.8], // 0.2
  ['#97a6f0', '#5eb4f6', 0.86], // 0.5
  ['#82acef', '#3b8fef', 0.9], // 1
  ['#6cbcee', '#3f6fe0', 0.92], // 2.5
  ['#56d4ed', '#6a55d8', 0.94], // 5
  ['#5bedd2', '#9b4fcf', 0.95], // 7.5
  ['#d6ed40', '#cf4fa6', 0.95], // 10
  ['#e8d318', '#ec5a7a', 0.95], // 15
  ['#dcaf0d', '#f47a5b', 0.95], // 20
  ['#c9880a', '#f89a4a', 0.95], // 25
  ['#b66507', '#fbb944', 0.95], // 30
  ['#a24605', '#fdd46a', 0.95], // 40
  ['#8d2c03', '#feeaa0', 0.95], // 65
  ['#781501', '#fff7d6', 0.95], // 100
]
/** Farther than this (RGB distance) from the ramp, a color belongs to another style and is kept. */
const FMI_RATE_RAMP_TOLERANCE = 0.12

const hexRgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
const rampColor = (color: string, alpha: number) => `vec4(${[...hexRgb(color), alpha].map(f).join(', ')})`
const rampSegments = FMI_RATE_RAMP.slice(1).map(([from, to, alpha], i) => {
  const [prevFrom, prevTo, prevAlpha] = FMI_RATE_RAMP[i]
  return `  rampSegment(p, ${v3(hexRgb(prevFrom))}, ${v3(hexRgb(from))}, ${rampColor(prevTo, prevAlpha)}, ${rampColor(to, alpha)}, best, result);`
}).join('\n')

// Radar heatmap: the frame's colors, sampled "sharp bilinear" so cells stay crisp
// blocks when zoomed in and filter smoothly when zoomed out.
export const HEATMAP_FS_SOURCE = `
precision highp float;

${VIEW_GLSL}

uniform vec2 u_texResolution;
// Output pixels covered by one radar texel, per axis.
uniform vec2 u_pixelsPerTexel;
uniform float u_opacity;

vec4 sampleSharp(sampler2D tex, vec2 uv) {
  vec2 p = uv * u_texResolution;
  vec2 cell = floor(p);
  // Magnified: hard cell edges with a one-pixel ramp. Minified: plain bilinear.
  vec2 inside = clamp((p - cell - 0.5) * max(u_pixelsPerTexel, vec2(1.0)), -0.5, 0.5) + 0.5;
  return texture2D(tex, (cell + inside) / u_texResolution);
}

// Keeps the closest point of one ramp segment, carrying its heatmap color along.
void rampSegment(vec3 p, vec3 a, vec3 b, vec4 colorA, vec4 colorB, inout float best, inout vec4 result) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  vec3 d = p - (a + ab * t);
  float distance = dot(d, d);
  if (distance < best) {
    best = distance;
    result = mix(colorA, colorB, t);
  }
}

// Premultiplied frame color in (see CloudRadarCanvas), premultiplied heatmap color out.
vec4 heatmapColor(vec4 c) {
  if (c.a <= 0.0) return vec4(0.0);
  vec3 p = c.rgb / c.a;
  float best = ${f(FMI_RATE_RAMP_TOLERANCE * FMI_RATE_RAMP_TOLERANCE)};
  // Colors off the ramp keep their own.
  vec4 result = vec4(p, 1.0);
${rampSegments}
  // Frame alpha still fades the faintest echoes and antialiased cell edges.
  float alpha = result.a * c.a;
  return vec4(result.rgb * alpha, alpha);
}

void main() {
  vec2 uv = radarUv(worldPosition());
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 prev = u_morph >= 1.0 ? vec4(0.0) : heatmapColor(sampleSharp(u_texPrev, uv));
  vec4 next = u_morph <= 0.0 ? vec4(0.0) : heatmapColor(sampleSharp(u_texNext, uv));
  gl_FragColor = mix(prev, next, u_morph) * u_opacity;
}
`
