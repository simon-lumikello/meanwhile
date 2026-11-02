import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createHomeCamera } from '../src/camera'
import { cloudFrameRate } from '../src/cloudFrameRate'
import { CLOUD_RENDER_POLICY } from '../src/cloudVisualTuning'
import { RadarFrameLoop, type RadarFrame } from '../src/RadarFrameLoop'

const camera = createHomeCamera(60.17, 24.94, 20000, 800, 600)
let callbacks = new Map<number, FrameRequestCallback>()
let nextId = 0

/** Runs one display frame at `time`. */
function displayFrame(time: number) {
  const pending = [...callbacks.values()]
  callbacks.clear()
  pending.forEach(callback => callback(time))
}

function recorder() {
  const frames: RadarFrame[] = []
  return { frames, listener: (frame: RadarFrame) => { frames.push(frame) } }
}

beforeEach(() => {
  callbacks = new Map()
  globalThis.requestAnimationFrame = callback => {
    callbacks.set(++nextId, callback)
    return nextId
  }
  globalThis.cancelAnimationFrame = id => { callbacks.delete(id) }
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame')
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame')
})

describe('radar frame loop', () => {
  test('each animating layer draws at its own frame rate on a 60 Hz display', () => {
    const loop = new RadarFrameLoop(camera)
    const clouds = recorder()
    const planes = recorder()
    loop.subscribe(clouds.listener)
    loop.subscribe(planes.listener)
    loop.setAnimating(clouds.listener, 30)
    loop.setAnimating(planes.listener, true)
    for (let i = 0; i <= 60; i++) displayFrame(i * 1000 / 60)
    expect(planes.frames.length).toBe(61)
    expect(clouds.frames.length).toBe(31)
    // Each layer's delta is the time since its own previous frame.
    expect(clouds.frames[2].deltaMs).toBeCloseTo(1000 / 30)
    expect(planes.frames[2].deltaMs).toBeCloseTo(1000 / 60)
  })

  test('a still layer draws only when a redraw is requested', () => {
    const loop = new RadarFrameLoop(camera)
    const heatmap = recorder()
    loop.subscribe(heatmap.listener)
    displayFrame(0)
    for (let i = 1; i <= 10; i++) displayFrame(i * 16)
    expect(heatmap.frames.length).toBe(1)
    expect(callbacks.size).toBe(0)
    loop.request()
    displayFrame(500)
    expect(heatmap.frames.length).toBe(2)
    expect(heatmap.frames[1].deltaMs).toBe(500)
  })

  test('a moving map draws the layers itself and is never asked to repaint for animation', () => {
    const loop = new RadarFrameLoop(camera)
    let repaints = 0
    const clouds = recorder()
    loop.subscribe(clouds.listener)
    loop.attachDriver(() => { repaints++ })
    loop.setAnimating(clouds.listener, 30)
    // The map moves: it renders every display frame, each drawing every layer once.
    for (let i = 0; i < 10; i++) {
      loop.tick(i * 16 + 2, camera)
      displayFrame(i * 16 + 16)
    }
    expect(clouds.frames.length).toBe(10)
    // Still again: the clouds carry on at their own rate without the map.
    for (let i = 10; i < 40; i++) displayFrame(i * 16 + 16)
    expect(clouds.frames.length).toBeGreaterThanOrEqual(24)
    expect(clouds.frames.length).toBeLessThanOrEqual(26)
    expect(repaints).toBe(1)
  })

  test('unsubscribing stops a layer animating', () => {
    const loop = new RadarFrameLoop(camera)
    const clouds = recorder()
    const unsubscribe = loop.subscribe(clouds.listener)
    loop.setAnimating(clouds.listener, 30)
    displayFrame(0)
    unsubscribe()
    expect(callbacks.size).toBe(0)
  })
})

describe('cloud frame rate', () => {
  const [near, far] = CLOUD_RENDER_POLICY.idleFrameRate
  const [nearMeters, farMeters] = CLOUD_RENDER_POLICY.idleFrameRateMetersPerPixel

  test('boiling clouds slow down as the map zooms out', () => {
    expect(cloudFrameRate('clouds', false, nearMeters / 4)).toBe(near)
    expect(cloudFrameRate('clouds', false, nearMeters)).toBe(near)
    expect(cloudFrameRate('clouds', false, farMeters)).toBeCloseTo(far)
    expect(cloudFrameRate('clouds', false, farMeters * 8)).toBeCloseTo(far)
    const middle = cloudFrameRate('clouds', false, Math.sqrt(nearMeters * farMeters))
    expect(middle).toBeCloseTo(Math.sqrt(near * far))
  })

  test('a morph into a new scan keeps its smooth rate at every zoom', () => {
    for (const meters of [nearMeters, farMeters * 4]) {
      expect(cloudFrameRate('clouds', true, meters)).toBe(CLOUD_RENDER_POLICY.morphFrameRate)
      expect(cloudFrameRate('heatmap', true, meters)).toBe(CLOUD_RENDER_POLICY.morphFrameRate)
    }
  })

  test('a still heatmap does not animate', () => {
    expect(cloudFrameRate('heatmap', false, nearMeters)).toBe(0)
  })
})
