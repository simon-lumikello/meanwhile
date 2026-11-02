import { describe, it, expect } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DailyOutlook } from '@simon-lumikello/meanwhile-weather/core'
import { AmbientView } from '../src/AmbientView'

describe('AmbientView clock and date/location area', () => {
  const fixedTime = new Date('2026-09-25T12:30:00.000Z')

  it('renders date with calendar icon and omits location when none is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(AmbientView, { currentTime: fixedTime })
    )

    expect(html).toContain('lucide-calendar')
    expect(html).toContain('Friday, 25 September')
    expect(html).not.toContain('lucide-map-pin')
  })

  it('renders location with location icon when location prop is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(AmbientView, { currentTime: fixedTime, location: 'Otaniemi' })
    )

    expect(html).toContain('lucide-calendar')
    expect(html).toContain('Friday, 25 September')
    expect(html).toContain('lucide-map-pin')
    expect(html).toContain('Otaniemi')
  })

  it('omits location if whitespace-only string is passed', () => {
    const html = renderToStaticMarkup(
      React.createElement(AmbientView, { currentTime: fixedTime, location: '   ' })
    )

    expect(html).not.toContain('lucide-map-pin')
  })
})

describe('AmbientView week outlook', () => {
  const fixedTime = new Date(2026, 8, 25, 12, 30)
  const day = (date: string, maxTemp: number): DailyOutlook => ({
    date,
    minTemp: maxTemp - 6,
    maxTemp,
    dominantSymbol: 'partly-cloudy-day',
    maxPrecipProbability: 0,
    totalPrecipMm: 0,
    maxWindSpeed: 4,
    isStormWarning: false,
  })
  const weekForecast = [
    day('2026-09-26', 99),
    day('2026-09-27', 11),
    day('2026-09-28', 12),
    { ...day('2026-09-29', 13), totalPrecipMm: 4.2 },
    { ...day('2026-09-30', 14), isStormWarning: true, maxWindSpeed: 17 },
    day('2026-10-01', 15),
    day('2026-10-02', 16),
  ]

  it('shows the five days after tomorrow when switched on', () => {
    const html = renderToStaticMarkup(
      React.createElement(AmbientView, { currentTime: fixedTime, weekForecast, showWeek: true })
    )

    expect(html).toContain('data-open="true"')
    expect(html.match(/ambient-week-card/g)).toHaveLength(5)
    expect(html).not.toContain('99°')
    expect(html).toContain('Sun')
    expect(html).toContain('Thu')
    expect(html).not.toContain('16°')
    expect(html).toContain('4.2 mm')
    expect(html).toContain('17 m/s')
  })

  it('keeps the row collapsed when switched off, and has no toggle unless the host handles one', () => {
    const html = renderToStaticMarkup(
      React.createElement(AmbientView, { currentTime: fixedTime, weekForecast, showWeek: false })
    )

    expect(html).toContain('data-open="false"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('ambient-week-toggle')
  })

  it('offers an on-screen toggle when the host handles it', () => {
    const html = renderToStaticMarkup(
      React.createElement(AmbientView, { currentTime: fixedTime, weekForecast, showWeek: false, onShowWeekChange: () => {} })
    )

    expect(html).toContain('ambient-week-toggle')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Week ahead')
  })

  it('keeps the radar in the same place whichever way the on-screen toggle is set', () => {
    const globals = globalThis as { window?: unknown }
    const previousWindow = globals.window
    globals.window = { innerWidth: 1600, innerHeight: 1200 }
    try {
      const placement = (showWeek: boolean) => {
        const html = renderToStaticMarkup(
          React.createElement(AmbientView, {
            currentTime: fixedTime,
            weekForecast,
            showWeek,
            onShowWeekChange: () => {},
            radarSlot: React.createElement('section', { className: 'test-radar' }),
          })
        )
        return html.includes('grid-cols-3') ? 'row' : 'stacked'
      }

      expect(placement(false)).toBe(placement(true))
    } finally {
      globals.window = previousWindow
    }
  })
})
