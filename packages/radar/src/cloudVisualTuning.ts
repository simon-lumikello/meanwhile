/**
 * OWNER VISUAL TUNING — edit here, then review the cloud-rendering Playwright snapshots.
 * These are compile-time art-direction controls, deliberately absent from user settings.
 * Defaults preserve the established renderer. UV distances are fractions of the viewport;
 * they are artistic scales, not additional weather measurements.
 *
 * Three tables, each read by a different part of the renderer:
 * - `CLOUD_VISUAL_TUNING`: the flat WebGL1 cloud renderer (`cloudShaders.ts`), used where
 *   WebGL2 is missing. Two entries reach the volumetric renderer too: `clouds.evolutionSpeed`
 *   and the rain `moistureStart` / `moistureFull` thresholds.
 * - `CLOUD_VOLUME_TUNING`: the volumetric WebGL2 renderer (`volumeShaders.ts`,
 *   `volumetricClouds.ts`) and the sun, moon and sky light for it (`cloudLighting.ts`).
 * - `CLOUD_RENDER_POLICY`: frame rates, resolutions and sample counts: cost, not looks.
 *
 * Vocabulary used below:
 * - Moisture: the radar's value at a point, 0–1, decoded from the FMI rate colour ramp and
 *   smoothed (`getRadarDensity` in `cloudShaders.ts`). About 0.40 is a trace echo
 *   (0.1 mm/h), 0.45 light rain (0.2 mm/h), 0.75 moderate rain (5 mm/h), 0.86 and up heavy
 *   rain; it is not mm/h.
 * - Envelope: how wet the radar says an area is, 0 (dry, no echo) to 1 (well inside rain).
 *   The WebGL1 renderer blends each dry / wet pair of settings by it.
 * - Noise volume: fractal noise, 0–1, that gives the clouds their shape; the radar only
 *   decides how much of it becomes cloud.
 * - Density: 1 − exp(−(noise volume − coverage threshold) × optical depth × `clouds.opticalExtinction`).
 * - Colours are linear RGB, 0–1. `shade…` is the side facing away from the light, `lit…`
 *   the side facing it. The `night…` colours take over 65% of the mix in the dark theme.
 * - View height: the viewport's height in ground (EPSG:3857) meters, so a setting in view
 *   heights keeps its on-screen size at every zoom.
 */
export const CLOUD_VISUAL_TUNING = {
  /** White fair-weather clouds (WebGL1), and a few settings the rain and storm decks share. */
  clouds: {
    /**
     * Static-frame boiling / breathing speed. 0 freezes procedural cloud evolution; 0.5
     * halves its speed. Radar playback still animates independently. It scales both the
     * WebGL1 noise drift along the wind and the volumetric domes' boil (`CLOUD_VOLUME_TUNING.boilSeconds`).
     */
    evolutionSpeed: 4,
    /**
     * How far, in view heights, large billows push the point the radar is read at: higher
     * bends the radar's outline into wider sweeps and lobes; 0 follows the smoothed radar.
     */
    envelopeWarpLarge: 0.08,
    /** The same for small billows: finer wobble along the outline. */
    envelopeWarpSmall: 0.04,
    /**
     * Radar diffusion radius, in view heights, clamped to 1.5–15 km of ground: rounds the
     * radar's square cells into soft areas before the clouds are shaped from them. Keep the
     * full sampling kernel for real coarse radar cells. The volumetric renderer uses
     * `CLOUD_VOLUME_TUNING.whiteRadius` instead.
     */
    smoothingRadius: 0.055,
    /**
     * Noise volume needed to form cloud over dry ground: higher leaves fewer, smaller
     * fair-weather puffs. The rain and storm decks also start from it at their outer edge.
     */
    coverageDry: 0.80,
    /** Noise volume needed to form cloud well inside rain: low, so the sky is nearly overcast. */
    coverageWet: 0.15,
    /** How quickly cloud turns opaque past its edge over dry ground: low keeps puffs milky. */
    opticalDepthDry: 1.8,
    /** The same well inside rain, where cloud turns opaque almost at once. */
    opticalDepthWet: 5.0,
    /** Overall multiplier on optical depth, for the white clouds and both decks. */
    opticalExtinction: 1.8,
    /**
     * Least opacity of a second, translucent layer of wispy tongues that peeks out a little
     * past the main clouds. It varies up to `secondaryOpacityMax` with mid-sized billows, so
     * it never looks like a flat veil.
     */
    secondaryOpacityMin: 0.08,
    secondaryOpacityMax: 0.42,
    /** Opacity of the main cloud body where the radar is barely wet (moisture 0.02). */
    primaryOpacityMin: 0.70,
    /** Opacity of the main cloud body from moisture 0.40 up; always capped at 0.92, so the map never disappears. */
    primaryOpacityMax: 0.90,
    /**
     * Darkness of the white clouds' ground shadow, before the sun or moon's own strength
     * (weaker at low sun, fainter still by moonlight) scales it.
     */
    shadowOpacity: 0.50,
    /** Fair-weather cloud colour on the side facing away from the light. */
    shadeColor: [0.95, 0.97, 0.99],
    /** Fair-weather cloud colour on the side facing the light. */
    litColor: [0.98, 0.99, 1.00],
    /** `shadeColor` in the dark theme. */
    nightShadeColor: [0.82, 0.87, 0.93],
    /** `litColor` in the dark theme. */
    nightLitColor: [0.95, 0.97, 1.00],
  },
  /**
   * Precipitation is shown by cloud colour, stacked by severity rather than altitude: white
   * clouds at the back, rain clouds over them, storm clouds nearest the viewer. Each is an
   * independent cloud deck built like the white clouds (fractal volume and optical density,
   * so fluffy edges and holes), from its own noise. Moisture thresholds class each radar
   * cell's density (not mm/h) as rain or storm; a deck covers the ground where most of the
   * cells within this many meters are, the same ground at every zoom, where the heatmap
   * shows it, and frays over this radius at its edge.
   */
  precipitationRadius: 1500,
  /**
   * Meters of ground the billows may nudge a deck's edge (typically a third of this each
   * way), and never more than 3% of the view height.
   */
  precipitationEdgeWarp: 2500,
  /**
   * Density (0–1) left in the hollows between a deck's billows where the radar is wet:
   * billows shade the deck, never open it, since hollows follow the view and rain must
   * follow the ground.
   */
  deckVeil: 0.9,
  /**
   * Blue-grey rain deck, over the white clouds. Its fields mirror `storm`. Of the `clouds`
   * settings, `coverage`, `opticalDepth` and the colours work alike; the moisture range,
   * billow size, boil and cast shadow are the deck's own.
   */
  rain: {
    /**
     * Moisture at which a radar cell starts to count as rain. Trace echoes (0.1 mm/h and
     * under) reach 0.40, so this sits just above them. Both renderers use this threshold.
     */
    moistureStart: 0.405,
    /**
     * Moisture at which a cell fully counts as rain: light rain (0.2 mm/h), where the
     * heatmap turns blue, is about 0.45. Both renderers use this threshold.
     */
    moistureFull: 0.445,
    /**
     * Noise volume needed to form a billow where the deck is full, as `clouds.coverageWet`
     * for the white clouds; it eases up to `clouds.coverageDry` at the deck's edge. Lower
     * fills the deck in with more, larger billows.
     */
    coverage: 0.43,
    /** Large billows per view height, as the white clouds' 2.8: higher makes smaller billows. */
    billowScale: 4.0,
    /** How fast the billows churn and drift, as a multiple of the white clouds' (`clouds.evolutionSpeed`). */
    boil: 1.5,
    /**
     * Thickness in the density formula, as `clouds.opticalDepthWet`; the deck's weak
     * outskirts get 30% of it, so they fade into translucent wisps.
     */
    opticalDepth: 6.0,
    /** Opacity at full density; unlike the white clouds it is not capped at 0.92. */
    opacity: 0.96,
    /** How much the deck darkens what lies beneath it, the white clouds and the ground, in sun or moonlight (0–1). */
    castShadow: 0.2,
    /** Colour on the side facing away from the light. */
    shadeColor: [0.46, 0.55, 0.70],
    /** Colour on the side facing the light. */
    litColor: [0.70, 0.78, 0.90],
    /** `shadeColor` in the dark theme. */
    nightShadeColor: [0.30, 0.38, 0.54],
    /** `litColor` in the dark theme. */
    nightLitColor: [0.50, 0.59, 0.74],
  },
  /** Dark storm deck, nearest the viewer, over both. Its fields work as `rain`'s do. */
  storm: {
    /** Moisture at which a cell starts to count as storm: moderate rain of a few mm/h. */
    moistureStart: 0.72,
    /** Moisture at which a cell fully counts as storm: heavy rain, 0.86 and up. */
    moistureFull: 0.88,
    /** Noise volume needed to form a billow where the deck is full; see `rain.coverage`. */
    coverage: 0.36,
    /** Large billows per view height; see `rain.billowScale`. */
    billowScale: 4.5,
    /** Churn and drift speed; see `rain.boil`. */
    boil: 1.5,
    /** Thickness in the density formula; see `rain.opticalDepth`. */
    opticalDepth: 7.0,
    /** Opacity at full density. */
    opacity: 0.97,
    /** How much the deck darkens the rain deck, white clouds and ground beneath it (0–1). */
    castShadow: 0.28,
    /** Colour on the side facing away from the light. */
    shadeColor: [0.32, 0.35, 0.43],
    /** Colour on the side facing the light. */
    litColor: [0.50, 0.54, 0.62],
    /** `shadeColor` in the dark theme. */
    nightShadeColor: [0.18, 0.20, 0.26],
    /** `litColor` in the dark theme. */
    nightLitColor: [0.30, 0.33, 0.40],
  },
} as const

/**
 * Volumetric clouds (WebGL2): a cloud volume raymarched from above and lit by the sun or
 * moon, used wherever WebGL2 is available; the settings above drive the WebGL1 fallback.
 * The radar decides where cloud is, over fixed ground distances, so its outline and holes
 * stay put while zooming. Domes raise its top: rounded caps on grids anchored to the
 * ground, each size twice the last, stacked like a cauliflower; zooming in adds smaller
 * ones. Billow noise carves the tops into puffs. Precipitation shades the same body;
 * storms raise its tallest towers.
 *
 * "Coverage" here is the smoothed radar share of a point that is cloud, rain or storm
 * (0–1), not the WebGL1 noise threshold of the same name.
 */
export const CLOUD_VOLUME_TUNING = {
  /**
   * Radar smoothing of the white clouds, in ground meters (rain uses `precipitationRadius`).
   * Larger merges nearby showers into one cloud and fills small holes; smaller follows the
   * radar's cells more closely.
   */
  whiteRadius: 4500,
  /**
   * Minimum footprint modelling span, in white-radius multiples. Closer views retain
   * the broad cloud body while visible domes and surface billows reveal finer detail.
   */
  bodySpanRadii: 8,
  /**
   * Procedural structure needed to form white cloud: [sparse regional echoes, continuous
   * coverage]. Lower thresholds merge puffs into a deck without tracing the radar cells.
   */
  formationThreshold: [0.82, 0.24],
  /** Towards the edge of a cloud, billows carve up to 1 + edgeFray times deeper. */
  edgeFray: 1.0,
  /** Share of its density a cloud keeps at its edge: translucent rims rather than a wall. */
  edgeOpacity: 0.35,
  /** How steeply white cloud density rises at its edge, as a share of `sharpness`: fluffier rims. */
  edgeSoftness: 0.6,
  /**
   * Clouds fade out to nothing at their edge at every zoom, so edges stay soft zoomed out,
   * where the radar's edge spans only a few pixels: over about the first number of screen
   * pixels, then the rest of the way in over the second.
   */
  edgeFadePixels: [8, 32],
  /** Most opacity of a cloud too small for the wider edge fade. */
  smallCloudOpacity: 0.75,
  /** How strongly the billows break the edge fade into wisps. */
  edgeFadeWisps: 0.5,
  /**
   * Smallest dome, in meters. Smaller values add finer lumps close up, at the cost of more
   * dome sizes to draw.
   */
  smallestDome: 1000,
  /**
   * Width in pixels at which a dome size fades in (fully in at twice that). Larger sizes
   * fade out past a quarter of the view height.
   */
  smallestDomePixels: 10,
  /** Dome radius over its grid cell: near 1 neighbouring domes touch and merge; lower leaves gaps. */
  domeRadius: 0.95,
  /** Dome height over its grid cell: taller cloud tops and deeper shading. */
  domeHeight: 0.45,
  /**
   * Smallest a white dome gets over the largest of its size (0–1), drawn so that most are
   * small and a few full: lower mixes sizes more and avoids an even, fleece-like texture.
   */
  domeVariety: 0.55,
  /**
   * White clouds thin out across regions about this wide, in meters, fixed to the ground, so a
   * sky mixes towering cumulus with thinner, broken cloud instead of one even blanket.
   */
  thicknessScale: 40000,
  /** Dome height in the thinnest regions, over the thickest: lower is more broken and translucent. */
  thinnest: 0.65,
  /** Share of grid cells left without a white dome of that size, so larger domes show between smaller ones. */
  domeGaps: 0.15,
  /**
   * A dome's size follows the radar density under its centre, but at most this many times
   * its average over the dome's width, so small showers and clouds never carry the height
   * of a dome far larger than themselves. Lower flattens isolated small clouds.
   */
  domeSupport: 1.5,
  /** How much more slowly heights grow than sizes (0: in step), so small domes stand out on large ones. */
  domeHeightFalloff: 0,
  /** Height of storm domes, as a multiple of a normal dome's. */
  stormHeight: 1.8,
  /** White cloud base under the domes, in view heights. */
  whiteBase: 0.035,
  /** Depth, in view heights, of the band under the tops that billows carve into puffs: more is lumpier. */
  surface: 0.05,
  /** How deeply billows carve the white cloud: more is more broken. */
  erode: 0.4,
  /** How abruptly density rises under the surface: higher gives crisper puffs, lower hazier ones. */
  sharpness: 2.2,
  /** Billow noise cells per view height at the start of a zoom level. */
  noiseCellsPerView: 5,
  /** Puffs per noise cell: higher gives more, smaller puffs. */
  billowsPerCell: 2.8,
  /**
   * Extinction of full-density cloud per view height: higher is more opaque, and darkens
   * the shaded sides, since light crossing the cloud dims faster.
   */
  extinction: 200,
  /** Sunlight at `sunDayElevation` and above. */
  sunColor: [1.0, 0.97, 0.92],
  /** Scales the sunlight; the moon and night light are not scaled by it. */
  sunIntensity: 1.2,
  /** Moonlight, and the night light (see `nightLight`). */
  moonColor: [0.75, 0.82, 1.0],
  /** The sky's blue fill in the shade by day: raise it for brighter, flatter shadows. */
  skyColor: [0.50, 0.52, 0.55],
  /** The sky's fill at night, from `twilightEnd` down. */
  nightSkyColor: [0.05, 0.07, 0.12],
  /**
   * Sunrise and sunset: sunlight grazing the horizon (0°) is this red, turns gold
   * (`sunLowColor`) from 5° up, and reaches `sunColor` at `sunDayElevation`.
   */
  sunHorizonColor: [1.0, 0.25, 0.10],
  sunLowColor: [1.0, 0.58, 0.24],
  /**
   * Sun elevation, in degrees, of full daylight colour. The 'noon' lighting choice raises
   * the sun to at least this, so it never shows sunrise or sunset colours.
   */
  sunDayElevation: 20,
  /** The sky fill around sunset: it turns violet through twilight. */
  twilightSkyColor: [0.40, 0.37, 0.54],
  /** The sky fill a few degrees below the horizon. */
  duskSkyColor: [0.24, 0.19, 0.46],
  /** Sun elevation, in degrees, where the sky reaches `nightSkyColor` and the night light is full. */
  twilightEnd: -9,
  /**
   * A cloud sees the sun set later the higher it is; heights run from [0] meters at the
   * ground to [1] at the top of the tallest cloud the view can hold, so tall towers and
   * cloud tops stay lit after the low cloud around them has gone violet. The sun's
   * elevation is worked out across the map, so near sunset clouds on the sun's side are
   * still golden while those on the far side are already in twilight. [1] also sets
   * `LAST_SUNLIGHT_ELEVATION`, where the highest cloud loses the sun.
   */
  cloudAltitude: [500, 10000],
  /**
   * Night light: the moon, but never dimmer than this (times `moonColor`), so clouds stay
   * visible on a moonless night. The light's direction turns from the sun's to the night's
   * once no cloud sees the sun; sunrise runs the same way backwards.
   */
  nightLight: 0.35,
  /**
   * Sun elevation, in degrees, where the night light starts to fade in, as the last
   * sunlight leaves the clouds and the dusk sky darkens; it is full at `twilightEnd`.
   */
  nightLightFrom: -1,
  /** Lowest the night light comes from (z of the unit vector towards it), the moon included. */
  nightLightLowest: 0.6,
  /**
   * Lowest the light is allowed to come from (z of the unit vector towards it): lower light
   * reaches under the domes and rakes across the cloud tops, at the cost of longer rays.
   */
  lowestLight: 0.12,
  /**
   * Rain cloud, as a tint on the light it scatters: the same cloud, darker and a little
   * bluer. Each channel multiplies the light (1: no change).
   */
  rainTint: [0.67, 0.70, 0.75],
  /** Share of the rain tint left at the top of a cloud over rain; its base takes all of it. */
  rainTopTint: 1.0,
  /** How far, in view heights, rain colours and thins the clouds around it. */
  rainNearby: 0.05,
  /** Storm cloud, as a tint on the light it scatters, on top of the rain tint. */
  stormTint: [0.55, 0.57, 0.63],
  /** Dark theme exposure, so clouds sit calmly on a dark map: multiplies their brightness (1 in the light theme). */
  darkExposure: 0.9,
  /** Darkness of the clouds' ground shadow. */
  groundShadow: 0.6,
  /**
   * Each cloud casts one shadow, as if it floated this many view heights up, so it lies
   * just beside the cloud, away from the light.
   */
  shadowHeight: 0.01,
  /** Farthest, in view heights, a shadow falls from its cloud at low sun. */
  shadowReach: 0.04,
  /**
   * Seconds for a dome to swell and settle once, and for the billows to churn by one puff,
   * at `clouds.evolutionSpeed` 1 (higher speeds divide it).
   */
  boilSeconds: 120,
} as const

/** Resource policy, separate from art direction. */
export const CLOUD_RENDER_POLICY = {
  /**
   * Highest device pixel ratio the clouds render at: on a 2× display they draw at half the
   * screen's resolution and are scaled up, which soft clouds hide. The heatmap renders at up to 2×.
   */
  maxDevicePixelRatio: 1,
  /**
   * How often, in milliseconds of the time shown, the sun and moon positions are worked out
   * again. During playback that time runs far faster than the clock, so the sky keeps up.
   */
  celestialRefreshMs: 1000,
  /**
   * Frames per second while morphing into a new radar scan, and during playback. Pans and
   * zooms draw at the map's own rate.
   */
  morphFrameRate: 30,
  /**
   * Frames per second while the map is still and the clouds only boil and drift, which
   * shows most zoomed in: [0] up to `idleFrameRateMetersPerPixel[0]`, easing to [1] at [1]
   * and beyond. Clouds drift about a pixel a second, so a display's full rate is wasted on them.
   */
  idleFrameRate: [30, 10],
  /**
   * Zoom range of that easing, in meters per pixel: [0] is the ±20 km preset on a 1440 pixel
   * tall screen, [1] about ±170 km.
   */
  idleFrameRateMetersPerPixel: [30, 240],
  /**
   * Volumetric clouds are soft, so they are raymarched at this fraction of the canvas width
   * and height and upscaled: halving it quarters the cost.
   */
  volumeRenderScale: 0.5,
  /** Fraction of the canvas resolution the radar coverage the clouds follow is prepared at. */
  volumeCoverageScale: 0.2,
  /** Fraction of the canvas resolution the cloud tops (domes) are prepared at. */
  volumeTopsScale: 0.35,
  /**
   * Samples along each view ray through the cloud: more is smoother and costs
   * proportionally more; too few shows banding, which `volumeHistory` averages away when
   * the view is still.
   */
  volumeViewSteps: 40,
  /** Samples along each ray from a sample towards the light, for self-shadowing. */
  volumeLightSteps: 6,
  /**
   * Share of the previous frame kept in each new one: averages sample grain away over a few
   * frames. The clouds change slowly, and the view is reprojected on the ground.
   */
  volumeHistory: 0.93,
  /** Less is kept while morphing into a new radar scan or playing back, so the change never smears. */
  volumeHistoryMorphing: 0.8,
} as const
