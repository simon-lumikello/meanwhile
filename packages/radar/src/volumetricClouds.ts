import { VS_SOURCE } from './cloudShaders'
import { CLOUD_RENDER_POLICY, CLOUD_VOLUME_TUNING } from './cloudVisualTuning'
import { COMPOSITE_FS, COVERAGE_FS, MARCH_FS, MAX_DOME_SIZES, NOISE_FS, NOISE_SIZE, TOPS_FS, VOLUME_VS } from './volumeShaders'

type Vec2 = readonly [number, number]
export type Vec3 = readonly [number, number, number]

/** Everything one volumetric frame needs, in world meters relative to the frame anchor (y north). */
export interface VolumeFrame {
  /** Canvas size, in pixels. */
  width: number
  height: number
  /** Top-left corner and size of the viewport. */
  viewOrigin: Vec2
  viewSize: Vec2
  /** Top-left corner and size of the radar frame extent. */
  texOrigin: Vec2
  texSize: Vec2
  morph: number
  /** Whether the clouds are morphing into a new radar scan or playing back. */
  morphing: boolean
  advection: Vec2
  /** Ground radii the white clouds and the rain are read from the radar over. */
  blurRadius: number
  rainRadius: number
  /** Zoom level of the viewport (see computeNoiseLevel), for the billow noise. */
  levelMeters: number
  levelT: number
  /** Wind drift of the procedural detail, in meters, and the boil clock, in boil periods. */
  drift: Vec2
  boil: number
  /** Towards the sun or moon (y north); its colour, the sky's, and the ground shadow strength. */
  lightDir: Vec3
  lightColor: Vec3
  skyColor: Vec3
  /**
   * Whether the sun or its twilight lights the clouds, which then take their light and sky
   * colours from the sun's elevation over each point instead of `skyColor`, with the night
   * light (`lightColor`) fading in as the sun goes down: in degrees at the frame anchor, and
   * its change per meter east and north.
   */
  sunLit: boolean
  sunPlane: Vec3
  shadowStrength: number
  exposure: number
}

interface Pass {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
  position: number
}

const COVERAGE_UNIFORMS = ['u_texPrev', 'u_texNext', 'u_morph', 'u_viewOrigin', 'u_viewSize', 'u_texOrigin',
  'u_texSize', 'u_advection', 'u_blurRadius', 'u_rainRadius', 'u_nearbyRadius']
const FIELD_UNIFORMS = ['u_fieldOrigin', 'u_fieldSize', 'u_coverageOrigin', 'u_coverageSize', 'u_span', 'u_zTop',
  'u_regionRadius', 'u_cell', 'u_levelT', 'u_level', 'u_drift', 'u_boil']
const TOPS_UNIFORMS = [...FIELD_UNIFORMS, 'u_bodySpan', 'u_coverage', 'u_pixelMeters', 'u_firstDome', 'u_domeSizes']
const MARCH_UNIFORMS = [...FIELD_UNIFORMS, 'u_tops', 'u_noise', 'u_coverage', 'u_viewOrigin', 'u_viewSize', 'u_lightDir',
  'u_lightColor', 'u_skyColor', 'u_sunLit', 'u_sunPlane', 'u_shadowStrength', 'u_exposure', 'u_viewSteps', 'u_lightSteps',
  'u_history', 'u_historyOrigin', 'u_historySize', 'u_historyWeight', 'u_frame', 'u_edgeRadius']

// Texture units: the radar frames stay on 0 and 1, where CloudRadarCanvas binds them.
const UNIT_COVERAGE = 2
const UNIT_TOPS = 3
const UNIT_NOISE = 4
const UNIT_CLOUDS = 5
const UNIT_HISTORY = 6

/** Share of the viewport height added on every side, so light rays find the clouds beside it. */
const FIELD_MARGIN = 0.25

/** Dome sizes evaluated for the cloud body, and their upper height bound, in meters (see TOPS_FS). */
export function domeSizes(span: number, pixelMeters: number) {
  const v = CLOUD_VOLUME_TUNING
  const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  const last = Math.max(0, Math.ceil(Math.log2(0.5 * span / v.smallestDome)))
  const first = Math.max(0, last - MAX_DOME_SIZES + 1,
    Math.floor(Math.log2(v.smallestDomePixels * pixelMeters / v.smallestDome)))
  // A dome's cap reaches its size times the storm height (with a swell), plus the smooth
  // maximum's allowance for overlapping caps.
  let zTop = v.whiteBase * span
  for (let level = first; level <= last; level++) {
    const cell = v.smallestDome * 2 ** level
    const weight = smoothstep(v.smallestDomePixels, 2 * v.smallestDomePixels, cell / pixelMeters) *
      (1 - smoothstep(0.25 * span, 0.5 * span, cell))
    const height = cell * v.domeHeight * (cell / (0.25 * span)) ** -v.domeHeightFalloff
    zTop += weight * height * (1.1 * v.stormHeight + Math.log(9) / 6)
  }
  return { first, count: Math.max(1, last - first + 1), zTop: Math.max(zTop, 0.05 * span) }
}

function compile(gl: WebGL2RenderingContext, vsSource: string, fsSource: string, uniformNames: string[]): Pass | null {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, source)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Volumetric cloud shader compile error:', gl.getShaderInfoLog(s))
      gl.deleteShader(s)
      return null
    }
    return s
  }
  const vs = shader(gl.VERTEX_SHADER, vsSource)
  const fs = shader(gl.FRAGMENT_SHADER, fsSource)
  const program = vs && fs ? gl.createProgram() : null
  if (!program || !vs || !fs) {
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
    return null
  }
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.detachShader(program, vs)
  gl.detachShader(program, fs)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Volumetric cloud program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  const uniforms = Object.fromEntries(uniformNames.map(name => [name, gl.getUniformLocation(program, name)]))
  return { program, uniforms, position: gl.getAttribLocation(program, 'a_position') }
}

function texture(gl: WebGL2RenderingContext, target: number, wrap: number): WebGLTexture {
  const tex = gl.createTexture()
  gl.bindTexture(target, tex)
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrap)
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrap)
  if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, wrap)
  return tex
}

/**
 * Volumetric clouds for CloudRadarCanvas on WebGL2: regional radar coverage for the cloud
 * body, finer local coverage for rain shading, cloud tops, a raymarch at reduced resolution,
 * and an upscale onto the canvas. Shaders compile and uniforms
 * resolve once; render targets are reallocated only when their size changes.
 */
export class VolumetricClouds {
  private readonly gl: WebGL2RenderingContext
  private readonly quad: WebGLBuffer
  private readonly coverage: Pass
  private readonly tops: Pass
  private readonly march: Pass
  private readonly composite: Pass
  private readonly noiseTex: WebGLTexture
  private readonly framebuffer: WebGLFramebuffer
  private coverageTex: WebGLTexture | null = null
  private localCoverageTex: WebGLTexture | null = null
  private topsTex: WebGLTexture | null = null
  // Raymarched clouds, alternately the frame being drawn and the previous one.
  private cloudsTex: (WebGLTexture | null)[] = [null, null]
  private coverageSize = [0, 0]
  private localCoverageSize = [0, 0]
  private topsSize = [0, 0]
  private cloudsSize = [0, 0]
  private frameCount = 0
  /** Where the previous frame's view was, once there is one to accumulate with. */
  private history: { origin: Vec2, size: Vec2 } | null = null

  private constructor(gl: WebGL2RenderingContext, quad: WebGLBuffer, passes: Record<'coverage' | 'tops' | 'march' | 'composite', Pass>,
    noiseTex: WebGLTexture, framebuffer: WebGLFramebuffer) {
    this.gl = gl
    this.quad = quad
    this.coverage = passes.coverage
    this.tops = passes.tops
    this.march = passes.march
    this.composite = passes.composite
    this.noiseTex = noiseTex
    this.framebuffer = framebuffer
  }

  /**
   * Null without half-float render targets (the cloud tops need their precision) or when a
   * program fails to compile; the caller keeps the classic renderer then.
   */
  static create(gl: WebGL2RenderingContext, quad: WebGLBuffer): VolumetricClouds | null {
    if (!gl.getExtension('EXT_color_buffer_float')) return null
    const coverage = compile(gl, VS_SOURCE, COVERAGE_FS, COVERAGE_UNIFORMS)
    const tops = compile(gl, VOLUME_VS, TOPS_FS, TOPS_UNIFORMS)
    const march = compile(gl, VOLUME_VS, MARCH_FS, MARCH_UNIFORMS)
    const composite = compile(gl, VS_SOURCE, COMPOSITE_FS, ['u_clouds'])
    const noise = compile(gl, VOLUME_VS, NOISE_FS, ['u_slice'])
    const framebuffer = gl.createFramebuffer()
    if (!coverage || !tops || !march || !composite || !noise || !framebuffer) {
      for (const pass of [coverage, tops, march, composite, noise]) if (pass) gl.deleteProgram(pass.program)
      if (framebuffer) gl.deleteFramebuffer(framebuffer)
      return null
    }

    gl.useProgram(coverage.program)
    gl.uniform1i(coverage.uniforms.u_texPrev, 0)
    gl.uniform1i(coverage.uniforms.u_texNext, 1)
    gl.useProgram(tops.program)
    gl.uniform1i(tops.uniforms.u_coverage, UNIT_COVERAGE)
    gl.useProgram(march.program)
    gl.uniform1i(march.uniforms.u_tops, UNIT_TOPS)
    gl.uniform1i(march.uniforms.u_noise, UNIT_NOISE)
    gl.uniform1i(march.uniforms.u_history, UNIT_HISTORY)
    gl.uniform1i(march.uniforms.u_coverage, UNIT_COVERAGE)
    gl.useProgram(composite.program)
    gl.uniform1i(composite.uniforms.u_clouds, UNIT_CLOUDS)

    // Bake the billow noise once, a slice per draw.
    const noiseTex = texture(gl, gl.TEXTURE_3D, gl.REPEAT)
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(0, 0, NOISE_SIZE, NOISE_SIZE)
    gl.useProgram(noise.program)
    bindQuad(gl, quad, noise.position)
    for (let slice = 0; slice < NOISE_SIZE; slice++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, noiseTex, 0, slice)
      gl.uniform1f(noise.uniforms.u_slice, slice + 0.5)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteProgram(noise.program)

    return new VolumetricClouds(gl, quad, { coverage, tops, march, composite }, noiseTex, framebuffer)
  }

  render(frame: VolumeFrame, texPrev: WebGLTexture | null, texNext: WebGLTexture | null): void {
    const { gl } = this
    const policy = CLOUD_RENDER_POLICY
    const [viewW, viewH] = frame.viewSize
    // Keep the broad cloud body when the camera moves inside it. Zoom only refines
    // the surface; it must not discard the domes supporting cloud over a town.
    const bodySpan = Math.max(viewH, CLOUD_VOLUME_TUNING.bodySpanRadii * frame.blurRadius)
    const margin = FIELD_MARGIN * viewH
    const fieldOrigin = [frame.viewOrigin[0] - margin, frame.viewOrigin[1] + margin] as const
    const fieldSize = [viewW + 2 * margin, viewH + 2 * margin] as const
    const pixelMeters = viewH / frame.height
    const fieldPixels = (scale: number) => [
      Math.max(8, Math.round(fieldSize[0] / pixelMeters * scale)),
      Math.max(8, Math.round(fieldSize[1] / pixelMeters * scale)),
    ] as const

    // The coverage lies on a grid fixed to the ground, in whole blocks of the coarsest
    // level its mipmaps are read at (see domes() in TOPS_FS): its averages then cover the
    // same ground while panning, or domes would swell and shrink, and their shadows swing,
    // as the view moves.
    // Dome centres and regional averages can be far outside a close view. This field
    // stays coarse enough for the source radar, independently of street-level pixels.
    const coverageTexel = Math.max(pixelMeters / policy.volumeCoverageScale, frame.blurRadius / 8)
    const blockTexels = 2 ** Math.max(0, Math.ceil(Math.log2(0.5 * bodySpan / coverageTexel)))
    const block = blockTexels * coverageTexel
    const coverageOrigin = [Math.floor((fieldOrigin[0] - bodySpan) / block) * block, Math.ceil((fieldOrigin[1] + bodySpan) / block) * block] as const
    const coverageBlocks = [
      Math.ceil((fieldOrigin[0] + fieldSize[0] + bodySpan - coverageOrigin[0]) / block),
      Math.ceil((coverageOrigin[1] - fieldOrigin[1] + fieldSize[1] + bodySpan) / block),
    ] as const
    const coverageW = coverageBlocks[0] * blockTexels
    const coverageH = coverageBlocks[1] * blockTexels
    const coverageSize = [coverageBlocks[0] * block, coverageBlocks[1] * block] as const
    const [localCoverageW, localCoverageH] = fieldPixels(policy.volumeCoverageScale)
    const [topsW, topsH] = fieldPixels(policy.volumeTopsScale)
    const cloudsW = Math.max(1, Math.round(frame.width * policy.volumeRenderScale))
    const cloudsH = Math.max(1, Math.round(frame.height * policy.volumeRenderScale))
    this.allocate(coverageW, coverageH, localCoverageW, localCoverageH, topsW, topsH, cloudsW, cloudsH)

    const sizes = domeSizes(bodySpan, pixelMeters)
    const setField = (u: Pass['uniforms']) => {
      gl.uniform2f(u.u_fieldOrigin, fieldOrigin[0], fieldOrigin[1])
      gl.uniform2f(u.u_fieldSize, fieldSize[0], fieldSize[1])
      gl.uniform2f(u.u_coverageOrigin, coverageOrigin[0], coverageOrigin[1])
      gl.uniform2f(u.u_coverageSize, coverageSize[0], coverageSize[1])
      gl.uniform1f(u.u_span, viewH)
      gl.uniform1f(u.u_regionRadius, frame.blurRadius)
      gl.uniform1f(u.u_zTop, sizes.zTop)
      gl.uniform1f(u.u_cell, frame.levelMeters / CLOUD_VOLUME_TUNING.noiseCellsPerView)
      gl.uniform1f(u.u_levelT, frame.levelT)
      gl.uniform1f(u.u_level, Math.round(Math.log2(frame.levelMeters / 1000)))
      gl.uniform2f(u.u_drift, frame.drift[0], frame.drift[1])
      gl.uniform1f(u.u_boil, frame.boil)
    }

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texPrev)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, texNext)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)

    // 1. Radar coverage over the field.
    let u = this.coverage.uniforms
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.coverageTex, 0)
    gl.viewport(0, 0, coverageW, coverageH)
    gl.useProgram(this.coverage.program)
    bindQuad(gl, this.quad, this.coverage.position)
    gl.uniform1f(u.u_morph, frame.morph)
    gl.uniform2f(u.u_viewOrigin, coverageOrigin[0], coverageOrigin[1])
    gl.uniform2f(u.u_viewSize, coverageSize[0], coverageSize[1])
    gl.uniform2f(u.u_texOrigin, frame.texOrigin[0], frame.texOrigin[1])
    gl.uniform2f(u.u_texSize, frame.texSize[0], frame.texSize[1])
    gl.uniform2f(u.u_advection, frame.advection[0], frame.advection[1])
    gl.uniform1f(u.u_blurRadius, frame.blurRadius)
    gl.uniform1f(u.u_rainRadius, frame.rainRadius)
    gl.uniform1f(u.u_nearbyRadius, Math.max(CLOUD_VOLUME_TUNING.rainNearby * viewH, 3 * frame.rainRadius))
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Rain shading reads the local field at screen resolution. Broad dome support
    // must not blur a shower or tint a larger area as rain at close zoom.
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.localCoverageTex, 0)
    gl.viewport(0, 0, localCoverageW, localCoverageH)
    gl.uniform2f(u.u_viewOrigin, fieldOrigin[0], fieldOrigin[1])
    gl.uniform2f(u.u_viewSize, fieldSize[0], fieldSize[1])
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // 2. The cloud tops.
    u = this.tops.uniforms
    gl.activeTexture(gl.TEXTURE0 + UNIT_COVERAGE)
    gl.bindTexture(gl.TEXTURE_2D, this.coverageTex)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.topsTex, 0)
    // Coverage averaged over larger areas, which sizes the larger domes.
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.viewport(0, 0, topsW, topsH)
    gl.useProgram(this.tops.program)
    bindQuad(gl, this.quad, this.tops.position)
    setField(u)
    gl.uniform1f(u.u_bodySpan, bodySpan)
    gl.uniform1f(u.u_pixelMeters, pixelMeters)
    gl.uniform1f(u.u_firstDome, sizes.first)
    gl.uniform1i(u.u_domeSizes, sizes.count)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // 3. The raymarch, accumulated with the previous frame.
    u = this.march.uniforms
    gl.activeTexture(gl.TEXTURE0 + UNIT_COVERAGE)
    gl.bindTexture(gl.TEXTURE_2D, this.localCoverageTex)
    const current = this.cloudsTex[this.frameCount % 2]
    const previous = this.cloudsTex[(this.frameCount + 1) % 2]
    gl.activeTexture(gl.TEXTURE0 + UNIT_TOPS)
    gl.bindTexture(gl.TEXTURE_2D, this.topsTex)
    gl.activeTexture(gl.TEXTURE0 + UNIT_NOISE)
    gl.bindTexture(gl.TEXTURE_3D, this.noiseTex)
    gl.activeTexture(gl.TEXTURE0 + UNIT_HISTORY)
    gl.bindTexture(gl.TEXTURE_2D, previous)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, current, 0)
    gl.viewport(0, 0, cloudsW, cloudsH)
    gl.useProgram(this.march.program)
    bindQuad(gl, this.quad, this.march.position)
    setField(u)
    gl.uniform2f(u.u_coverageOrigin, fieldOrigin[0], fieldOrigin[1])
    gl.uniform2f(u.u_coverageSize, fieldSize[0], fieldSize[1])
    gl.uniform2f(u.u_viewOrigin, frame.viewOrigin[0], frame.viewOrigin[1])
    gl.uniform2f(u.u_viewSize, viewW, viewH)
    gl.uniform3f(u.u_lightDir, frame.lightDir[0], frame.lightDir[1], frame.lightDir[2])
    gl.uniform3f(u.u_lightColor, frame.lightColor[0], frame.lightColor[1], frame.lightColor[2])
    gl.uniform3f(u.u_skyColor, frame.skyColor[0], frame.skyColor[1], frame.skyColor[2])
    gl.uniform1f(u.u_sunLit, frame.sunLit ? 1 : 0)
    gl.uniform3f(u.u_sunPlane, frame.sunPlane[0], frame.sunPlane[1], frame.sunPlane[2])
    gl.uniform1f(u.u_shadowStrength, frame.shadowStrength)
    gl.uniform1f(u.u_exposure, frame.exposure)
    gl.uniform1i(u.u_viewSteps, policy.volumeViewSteps)
    gl.uniform1i(u.u_lightSteps, policy.volumeLightSteps)
    gl.uniform2f(u.u_historyOrigin, this.history?.origin[0] ?? 0, this.history?.origin[1] ?? 0)
    gl.uniform2f(u.u_historySize, this.history?.size[0] ?? 1, this.history?.size[1] ?? 1)
    gl.uniform1f(u.u_historyWeight, this.history ? (frame.morphing ? policy.volumeHistoryMorphing : policy.volumeHistory) : 0)
    gl.uniform1f(u.u_frame, this.frameCount % 1024)
    const [nearFade, farFade] = CLOUD_VOLUME_TUNING.edgeFadePixels
    gl.uniform2f(u.u_edgeRadius, nearFade * pixelMeters, farFade * pixelMeters)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    this.history = { origin: frame.viewOrigin, size: frame.viewSize }
    this.frameCount++

    // 4. Upscale onto the canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.activeTexture(gl.TEXTURE0 + UNIT_CLOUDS)
    gl.bindTexture(gl.TEXTURE_2D, current)
    gl.viewport(0, 0, frame.width, frame.height)
    gl.useProgram(this.composite.program)
    bindQuad(gl, this.quad, this.composite.position)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.activeTexture(gl.TEXTURE0)
  }

  dispose(): void {
    const { gl } = this
    for (const pass of [this.coverage, this.tops, this.march, this.composite]) gl.deleteProgram(pass.program)
    for (const tex of [this.coverageTex, this.localCoverageTex, this.topsTex, ...this.cloudsTex, this.noiseTex]) if (tex) gl.deleteTexture(tex)
    gl.deleteFramebuffer(this.framebuffer)
  }

  /** Immutable storage, so a size change replaces the texture. */
  private allocate(coverageW: number, coverageH: number, localCoverageW: number, localCoverageH: number, topsW: number, topsH: number, cloudsW: number, cloudsH: number): void {
    const { gl } = this
    if (this.coverageSize[0] !== coverageW || this.coverageSize[1] !== coverageH) {
      if (this.coverageTex) gl.deleteTexture(this.coverageTex)
      this.coverageTex = texture(gl, gl.TEXTURE_2D, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      const levels = Math.floor(Math.log2(Math.max(coverageW, coverageH))) + 1
      gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, coverageW, coverageH)
      this.coverageSize = [coverageW, coverageH]
    }
    if (this.localCoverageSize[0] !== localCoverageW || this.localCoverageSize[1] !== localCoverageH) {
      if (this.localCoverageTex) gl.deleteTexture(this.localCoverageTex)
      this.localCoverageTex = texture(gl, gl.TEXTURE_2D, gl.CLAMP_TO_EDGE)
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, localCoverageW, localCoverageH)
      this.localCoverageSize = [localCoverageW, localCoverageH]
    }
    if (this.topsSize[0] !== topsW || this.topsSize[1] !== topsH) {
      if (this.topsTex) gl.deleteTexture(this.topsTex)
      this.topsTex = texture(gl, gl.TEXTURE_2D, gl.CLAMP_TO_EDGE)
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, topsW, topsH)
      this.topsSize = [topsW, topsH]
    }
    if (this.cloudsSize[0] !== cloudsW || this.cloudsSize[1] !== cloudsH) {
      this.cloudsTex = this.cloudsTex.map(old => {
        if (old) gl.deleteTexture(old)
        const tex = texture(gl, gl.TEXTURE_2D, gl.CLAMP_TO_EDGE)
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, cloudsW, cloudsH)
        return tex
      })
      this.cloudsSize = [cloudsW, cloudsH]
      // Fresh textures hold nothing to accumulate with.
      this.history = null
    }
  }
}

function bindQuad(gl: WebGL2RenderingContext, quad: WebGLBuffer, position: number) {
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
}
