import React from 'react'
import { describe, expect, it } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { WeatherSwimlane } from '@dashboard/features/timeline'

describe('Weather Lane presentation', () => {
  it('renders proportional precipitation bars without clamping', () => {
    const html = renderToString(
      React.createElement(WeatherSwimlane, {
        weatherPoints: [
          { time: '2026-09-16T10:00:00Z', temperature: 14, symbol: 'rain-light', precipitationMm: 0.2 },
          { time: '2026-09-16T12:00:00Z', temperature: 15, symbol: 'rain-moderate', precipitationMm: 1 },
        ],
        orientation: 'horizontal',
      })
    )

    const heights = Array.from(html.matchAll(/style="[^"]*height:([0-9.]+)%[^"]*"/g)).map((match) => Number(match[1]))
    expect(heights).toHaveLength(2)
    expect(heights[1]).toBeGreaterThan(heights[0])
    expect(heights[1] - heights[0]).toBeGreaterThanOrEqual(20)
  })
})
