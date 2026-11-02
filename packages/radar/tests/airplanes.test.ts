import { describe, expect, it } from 'bun:test'
import { parseAirplaneState, STANDARD_AIRPLANE_RADIUS_NM } from '../src/sources/aircraft'
import { RADAR_ZOOM_METERS } from '../src/core'

describe('Airplane Data Parsing & Coverage Engine', () => {
  it('correctly parses commercial airliner from adsb.lol / tar1090 state', () => {
    const rawState = {
      hex: '461f65',
      type: 'adsb_icao',
      flight: 'FIN2PX  ',
      r: 'OH-LXD',
      t: 'A320',
      alt_baro: 32000,
      alt_geom: 32500,
      gs: 450.0,
      true_heading: 137.81,
      category: 'A3',
      lat: 60.318890,
      lon: 24.966525,
    }

    const plane = parseAirplaneState(rawState)
    expect(plane).not.toBeNull()
    expect(plane?.icao24).toBe('461f65')
    expect(plane?.callsign).toBe('FIN2PX')
    expect(plane?.latitude).toBeCloseTo(60.318890, 5)
    expect(plane?.longitude).toBeCloseTo(24.966525, 5)
    // 32500 feet * 0.3048 = 9906 meters
    expect(plane?.altitude).toBeCloseTo(32500 * 0.3048, 1)
    // 450 knots * 0.514444 m/s
    expect(plane?.velocity).toBeCloseTo(450 * 0.514444, 1)
    expect(plane?.trueTrack).toBeCloseTo(137.81, 2)
    expect(plane?.category).toBe(3) // A3 -> 3 (Jet)
  })

  it('correctly maps rotorcraft / helicopter category', () => {
    const rawState = {
      hex: '469999',
      flight: 'HELI01',
      alt_baro: 1500,
      gs: 110.0,
      track: 90,
      category: 'A7', // Rotorcraft
      lat: 60.2,
      lon: 24.8,
    }

    const plane = parseAirplaneState(rawState)
    expect(plane).not.toBeNull()
    expect(plane?.category).toBe(8) // Mapped to OpenSky rotorcraft category 8
  })

  it('handles grounded aircraft altitude cleanly', () => {
    const rawState = {
      hex: '461f65',
      flight: 'FIN2PX',
      alt_baro: 'ground',
      gs: 0,
      track: 0,
      lat: 60.31,
      lon: 24.96,
    }

    const plane = parseAirplaneState(rawState)
    expect(plane).not.toBeNull()
    expect(plane?.altitude).toBe(0)
  })

  it('dates the position by its age in the response, not by when it was parsed', () => {
    const observedAtMs = 1_800_000_000_000
    expect(parseAirplaneState({ hex: 'abc', lat: 60.2, lon: 24.9, seen_pos: 12.5 }, observedAtMs)?.lastContact).toBe(observedAtMs / 1000 - 12.5)
    expect(parseAirplaneState({ hex: 'abc', lat: 60.2, lon: 24.9 }, observedAtMs)?.lastContact).toBe(observedAtMs / 1000)
    expect(parseAirplaneState({ hex: 'abc', lat: 60.2, lon: 24.9, seen_pos: -3 }, observedAtMs)?.lastContact).toBe(observedAtMs / 1000)
  })

  it('rejects planes with missing or invalid coordinates', () => {
    expect(parseAirplaneState({ hex: '123456', lat: null, lon: 24.9 })).toBeNull()
    expect(parseAirplaneState({ hex: '123456', lat: 60.1, lon: null })).toBeNull()
    expect(parseAirplaneState({ hex: '123456' })).toBeNull()
  })

  it('standard radius (75 NM) fully encompasses all radar zoom levels without refetching', () => {
    // 1 NM = 1852 meters
    const standardRadiusMeters = STANDARD_AIRPLANE_RADIUS_NM * 1852
    // 75 NM = 138,900 meters (~138.9 km)
    expect(standardRadiusMeters).toBeGreaterThanOrEqual(RADAR_ZOOM_METERS['local'])
    expect(standardRadiusMeters).toBeGreaterThanOrEqual(RADAR_ZOOM_METERS['close'])
    expect(standardRadiusMeters).toBeGreaterThanOrEqual(RADAR_ZOOM_METERS['standard'])
    expect(standardRadiusMeters).toBeGreaterThanOrEqual(RADAR_ZOOM_METERS['wide']) // 120,000m
  })
})
