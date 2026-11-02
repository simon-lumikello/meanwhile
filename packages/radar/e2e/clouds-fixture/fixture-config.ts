/** Owner-editable location and viewport for the repeatable cloud rendering fixture. */
export const CLOUD_FIXTURE = {
  location: {
    name: 'Ruka',
    latitude: 66.167,
    longitude: 29.139,
  },
  width: 380,
  height: 240,
  deltaMeters: 20000,
  style: 'radar_rate',
  // Fixed independently of capture time so later rendering comparisons are repeatable.
  lightingTime: '2026-09-20T11:00:00Z',
} as const

// After changing location or viewport, run `bun packages/radar/e2e/clouds-fixture/capture.ts`
// to replace the source raster and its metadata, then review updated snapshots.
