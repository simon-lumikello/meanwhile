import { CLOUD_RENDER_POLICY } from './cloudVisualTuning'

/**
 * Frames per second the radar layer asks for while the map is still (see
 * CLOUD_RENDER_POLICY): 0 leaves a still heatmap alone until something changes.
 */
export function cloudFrameRate(mode: 'clouds' | 'heatmap', isMorphing: boolean, metersPerPixel: number): number {
  const policy = CLOUD_RENDER_POLICY
  if (isMorphing) return policy.morphFrameRate
  if (mode === 'heatmap') return 0
  const [near, far] = policy.idleFrameRate
  const [nearMeters, farMeters] = policy.idleFrameRateMetersPerPixel
  // Eased by zoom level: each halving of the zoom takes the same share of the way.
  const t = Math.min(1, Math.max(0, Math.log2(metersPerPixel / nearMeters) / Math.log2(farMeters / nearMeters)))
  return near * (far / near) ** t
}
