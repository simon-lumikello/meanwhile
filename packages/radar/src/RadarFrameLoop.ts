import type { RadarCamera } from './camera'

export interface RadarFrame {
  camera: RadarCamera
  /** `performance.now()` for this frame. */
  now: number
  /** Time since this layer's previous frame; 0 on its first frame and after the page was hidden. */
  deltaMs: number
}

export type RadarFrameListener = (frame: RadarFrame) => void

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

/** A display frame this much early still counts as due, for vsync jitter. */
const FRAME_SLACK_MS = 4
/**
 * While the map renders on its own (a pan, zoom or ease), its renders draw every layer;
 * the loop's own frames wait until it has been still this long, so no layer draws twice
 * in one display frame.
 */
const DRIVER_ACTIVE_MS = 20

/**
 * One frame clock for every radar layer. While the map is mounted and moving, it drives
 * the clock from its own render event, so overlays draw in the very frame the basemap
 * moved and never trail it during wheel zoom or inertia. While it is still, the loop runs
 * on requestAnimationFrame and never makes the map repaint: each animating layer draws at
 * the frame rate it asks for, and a requested redraw draws them all. The clock sleeps
 * while the page is hidden and resumes without fast-forwarding.
 */
export class RadarFrameLoop {
  camera: RadarCamera
  private readonly listeners = new Set<RadarFrameListener>()
  /** Frames per second each animating layer asks for. */
  private readonly rates = new Map<RadarFrameListener, number>()
  /** When each layer last drew. */
  private readonly drawnAt = new Map<RadarFrameListener, number>()
  private rafId: number | null = null
  private redrawAll = false
  private lastDriverTick = -Infinity

  constructor(camera: RadarCamera) {
    this.camera = camera
  }

  subscribe(listener: RadarFrameListener): () => void {
    if (this.listeners.size === 0 && typeof document !== 'undefined') document.addEventListener('visibilitychange', this.handleVisibility)
    this.listeners.add(listener)
    this.request()
    return () => {
      this.listeners.delete(listener)
      this.rates.delete(listener)
      this.drawnAt.delete(listener)
      if (this.listeners.size > 0) return
      this.cancelOwnFrame()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.handleVisibility)
    }
  }

  /**
   * Keeps a layer drawing on its own, `frameRate` times a second: true is every display
   * frame; false or 0 only when the camera moves or a redraw is requested.
   */
  setAnimating(listener: RadarFrameListener, frameRate: number | boolean): void {
    const rate = frameRate === true ? Infinity : Number(frameRate)
    if (rate > 0) {
      this.rates.set(listener, rate)
      this.schedule()
    } else {
      this.rates.delete(listener)
    }
  }

  setCamera(camera: RadarCamera): void {
    this.camera = camera
    this.request()
  }

  /** Draws every layer against the map's camera. The map calls it after each of its renders. */
  tick(now = performance.now(), camera?: RadarCamera): void {
    if (camera) this.camera = camera
    this.lastDriverTick = now
    this.redrawAll = false
    this.draw(now, () => true)
  }

  /** Draws every layer on the next display frame. */
  request(): void {
    if (this.listeners.size === 0 || isHidden()) return
    this.redrawAll = true
    this.schedule()
  }

  /** Hands the camera to a map that calls `tick()` after each of its renders; `repaint` asks it for its first. */
  attachDriver(repaint: () => void): void {
    repaint()
  }

  detachDriver(): void {
    this.lastDriverTick = -Infinity
    this.request()
  }

  private schedule(): void {
    if (this.rafId !== null || this.listeners.size === 0 || isHidden() || typeof requestAnimationFrame === 'undefined') return
    if (!this.redrawAll && this.rates.size === 0) return
    this.rafId = requestAnimationFrame(time => {
      this.rafId = null
      this.frame(time)
    })
  }

  private frame(now: number): void {
    // A moving map draws every layer itself; a pending redraw waits until it stops.
    if (now - this.lastDriverTick >= DRIVER_ACTIVE_MS) {
      if (this.redrawAll) {
        this.redrawAll = false
        this.draw(now, () => true)
      } else {
        this.draw(now, listener => this.isDue(listener, now))
      }
    }
    this.schedule()
  }

  private draw(now: number, include: (listener: RadarFrameListener) => boolean): void {
    if (isHidden()) return
    for (const listener of this.listeners) {
      if (!include(listener)) continue
      const previous = this.drawnAt.get(listener)
      this.drawnAt.set(listener, now)
      listener({ camera: this.camera, now, deltaMs: previous === undefined ? 0 : Math.max(0, now - previous) })
    }
    this.schedule()
  }

  private isDue(listener: RadarFrameListener, now: number): boolean {
    const rate = this.rates.get(listener)
    if (!rate) return false
    const previous = this.drawnAt.get(listener)
    return previous === undefined || now - previous >= 1000 / rate - FRAME_SLACK_MS
  }

  private readonly handleVisibility = () => {
    if (isHidden()) {
      this.cancelOwnFrame()
      return
    }
    // Hidden time must not fast-forward playback, morphs, or drift.
    this.drawnAt.clear()
    this.request()
  }

  private cancelOwnFrame(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }
}
