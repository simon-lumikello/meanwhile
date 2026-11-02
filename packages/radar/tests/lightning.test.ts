import { describe, it, expect } from 'bun:test'
import {
  haversineDistanceKm,
  calculateBearing,
  classifyStrikeAge,
  projectStrikeToCanvas,
  parseFmiLightningXml,
  evaluateThunderstormStatus,
  getMockThunderstormData,
  type LightningStrike,
} from '../src/lightning'

describe('Lightning & Thunderstorm Calculations', () => {
  describe('haversineDistanceKm', () => {
    it('calculates distance between known coordinate points accurately', () => {
      // Helsinki Railway Station (60.1719, 24.9414) to Espoo Center (60.2052, 24.6558) is ~16.2 km
      const dist = haversineDistanceKm(60.1719, 24.9414, 60.2052, 24.6558)
      expect(dist).toBeGreaterThan(15)
      expect(dist).toBeLessThan(18)
    })

    it('returns 0 km for identical coordinates', () => {
      const dist = haversineDistanceKm(60.17, 24.94, 60.17, 24.94)
      expect(dist).toBe(0)
    })
  })

  describe('calculateBearing', () => {
    it('computes correct cardinal bearings', () => {
      // North
      expect(calculateBearing(60.0, 24.0, 60.5, 24.0)).toBe('N')
      // South
      expect(calculateBearing(60.5, 24.0, 60.0, 24.0)).toBe('S')
      // East
      expect(calculateBearing(60.0, 24.0, 60.0, 25.0)).toBe('E')
      // West
      expect(calculateBearing(60.0, 25.0, 60.0, 24.0)).toBe('W')
      // Southeast
      expect(calculateBearing(60.5, 24.0, 60.0, 25.0)).toBe('SE')
    })
  })

  describe('classifyStrikeAge', () => {
    it('classifies strikes under 3 minutes as fresh', () => {
      const now = new Date('2026-09-18T15:00:00Z')
      const strikeTime = new Date('2026-09-18T14:58:30Z').toISOString() // 1.5 min ago
      const { category, ageMinutes } = classifyStrikeAge(strikeTime, now)
      expect(category).toBe('fresh')
      expect(ageMinutes).toBeCloseTo(1.5, 1)
    })

    it('classifies strikes between 3 and 10 minutes as recent', () => {
      const now = new Date('2026-09-18T15:00:00Z')
      const strikeTime = new Date('2026-09-18T14:54:00Z').toISOString() // 6 min ago
      const { category } = classifyStrikeAge(strikeTime, now)
      expect(category).toBe('recent')
    })

    it('classifies strikes between 10 and 30 minutes as aging', () => {
      const now = new Date('2026-09-18T15:00:00Z')
      const strikeTime = new Date('2026-09-18T14:42:00Z').toISOString() // 18 min ago
      const { category } = classifyStrikeAge(strikeTime, now)
      expect(category).toBe('aging')
    })

    it('classifies strikes older than 30 minutes as expired', () => {
      const now = new Date('2026-09-18T15:00:00Z')
      const strikeTime = new Date('2026-09-18T14:25:00Z').toISOString() // 35 min ago
      const { category } = classifyStrikeAge(strikeTime, now)
      expect(category).toBe('expired')
    })
  })

  describe('projectStrikeToCanvas', () => {
    it('projects center coordinates exactly to the center of the canvas', () => {
      const { x, y, inBounds } = projectStrikeToCanvas(
        60.17,
        24.94,
        60.17,
        24.94,
        20000,
        640,
        400
      )
      expect(Math.round(x)).toBe(320)
      expect(Math.round(y)).toBe(200)
      expect(inBounds).toBe(true)
    })

    it('projects a point to the north higher up on canvas (lower y in screen coords)', () => {
      const center = projectStrikeToCanvas(60.17, 24.94, 60.17, 24.94, 20000, 640, 400)
      const north = projectStrikeToCanvas(60.25, 24.94, 60.17, 24.94, 20000, 640, 400)
      expect(north.y).toBeLessThan(center.y)
      expect(Math.round(north.x)).toBe(Math.round(center.x))
    })

    it('flags points far outside the viewport as out of bounds', () => {
      const { inBounds } = projectStrikeToCanvas(65.0, 24.94, 60.17, 24.94, 20000, 640, 400)
      expect(inBounds).toBe(false)
    })
  })

  describe('parseFmiLightningXml', () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:BsWfs="http://xml.fmi.fi/schema/wfs/2.0">
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="BsWfsElement.1.1">
      <BsWfs:Location>
        <gml:Point gml:id="BsWfsElementP.1.1">
          <gml:pos>60.25000 25.10000</gml:pos>
        </gml:Point>
      </BsWfs:Location>
      <BsWfs:Time>2026-09-18T14:50:00Z</BsWfs:Time>
      <BsWfs:ParameterName>multiplicity</BsWfs:ParameterName>
      <BsWfs:ParameterValue>2</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="BsWfsElement.1.2">
      <BsWfs:Location>
        <gml:Point gml:id="BsWfsElementP.1.2">
          <gml:pos>60.25000 25.10000</gml:pos>
        </gml:Point>
      </BsWfs:Location>
      <BsWfs:Time>2026-09-18T14:50:00Z</BsWfs:Time>
      <BsWfs:ParameterName>peak_current</BsWfs:ParameterName>
      <BsWfs:ParameterValue>24.5</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="BsWfsElement.1.3">
      <BsWfs:Location>
        <gml:Point gml:id="BsWfsElementP.1.3">
          <gml:pos>60.25000 25.10000</gml:pos>
        </gml:Point>
      </BsWfs:Location>
      <BsWfs:Time>2026-09-18T14:50:00Z</BsWfs:Time>
      <BsWfs:ParameterName>cloud_indicator</BsWfs:ParameterName>
      <BsWfs:ParameterValue>0</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
</wfs:FeatureCollection>`

    it('extracts lightning strikes from FMI XML correctly', () => {
      const now = new Date('2026-09-18T14:55:00Z')
      const strikes = parseFmiLightningXml(mockXml, 30, now)

      expect(strikes.length).toBe(1)
      expect(strikes[0].latitude).toBe(60.25)
      expect(strikes[0].longitude).toBe(25.1)
      expect(strikes[0].peakCurrentKa).toBe(24.5)
      expect(strikes[0].multiplicity).toBe(2)
      expect(strikes[0].isCloudToGround).toBe(true)
    })

    it('filters out expired strikes older than 30 minutes', () => {
      const futureNow = new Date('2026-09-18T15:35:00Z') // 45 min later
      const strikes = parseFmiLightningXml(mockXml, 30, futureNow)
      expect(strikes.length).toBe(0)
    })

    it('returns empty array on empty or invalid XML without throwing', () => {
      expect(parseFmiLightningXml('', 30)).toEqual([])
      expect(parseFmiLightningXml('invalid-xml', 30)).toEqual([])
    })
  })

  describe('evaluateThunderstormStatus', () => {
    it('identifies active storm with closest strike distance and bearing', () => {
      const now = new Date('2026-09-18T12:00:00Z')
      const strikes: LightningStrike[] = [
        {
          id: 's1',
          latitude: 60.20, // ~3.3 km North of 60.17
          longitude: 24.94,
          time: new Date('2026-09-18T11:58:00Z').toISOString(),
          isCloudToGround: true,
        },
        {
          id: 's2',
          latitude: 60.30, // ~14 km North
          longitude: 24.94,
          time: new Date('2026-09-18T11:50:00Z').toISOString(),
          isCloudToGround: true,
        },
      ]

      const status = evaluateThunderstormStatus(strikes, 60.17, 24.94, 50, now)
      expect(status.isActive).toBe(true)
      expect(status.recentStrikeCount).toBe(2)
      expect(status.closestStrikeKm).toBeCloseTo(3.3, 1)
      expect(status.closestStrikeBearing).toBe('N')
      expect(status.summary).toContain('Thunderstorm active')
    })

    it('returns inactive when no strikes or all strikes are expired', () => {
      const status = evaluateThunderstormStatus([], 60.17, 24.94)
      expect(status.isActive).toBe(false)
      expect(status.recentStrikeCount).toBe(0)
      expect(status.closestStrikeKm).toBeNull()
      expect(status.closestStrikeBearing).toBeNull()
    })
  })

  describe('getMockThunderstormData', () => {
    it('generates a realistic active thunderstorm status with staggered strike ages', () => {
      const now = new Date('2026-09-18T12:00:00Z')
      const status = getMockThunderstormData(60.17, 24.94, now)

      expect(status.isActive).toBe(true)
      expect(status.strikes.length).toBe(6)
      expect(status.closestStrikeKm).toBeGreaterThan(0)
      expect(status.closestStrikeKm).toBeLessThan(15)

      // Contains both fresh and older strikes
      const fresh = status.strikes.filter((s) => classifyStrikeAge(s.time, now).category === 'fresh')
      const recent = status.strikes.filter((s) => classifyStrikeAge(s.time, now).category === 'recent')
      const aging = status.strikes.filter((s) => classifyStrikeAge(s.time, now).category === 'aging')

      expect(fresh.length).toBeGreaterThanOrEqual(1)
      expect(recent.length).toBeGreaterThanOrEqual(1)
      expect(aging.length).toBeGreaterThanOrEqual(1)
    })
  })
})
