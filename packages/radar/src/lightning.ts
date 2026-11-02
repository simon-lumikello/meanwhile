import { latLonToWebMercator } from './mercator'

export interface LightningStrike {
  id: string
  latitude: number
  longitude: number
  time: string // ISO 8601 string
  peakCurrentKa?: number // kA (kiloamperes)
  multiplicity?: number // Number of strokes in flash
  isCloudToGround: boolean // true = ground (CG), false = cloud-to-cloud (IC)
  ellipseMajorKm?: number // Accuracy radius
}

export type StrikeAgeCategory = 'fresh' | 'recent' | 'aging' | 'expired'

export interface ThunderstormStatus {
  isActive: boolean
  strikes: LightningStrike[]
  recentStrikeCount: number
  closestStrikeKm: number | null
  closestStrikeBearing: string | null
  summary: string
}

/**
 * Calculates great-circle distance between two coordinate pairs using Haversine formula (in km).
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371.0 // Earth mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

const CARDINAL_SECTORS = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
] as const

/**
 * Calculates initial compass bearing (0-360) from observer (lat1, lon1) to target (lat2, lon2).
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): string {
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)

  const theta = Math.atan2(y, x)
  const bearingDeg = (((theta * 180) / Math.PI) % 360 + 360) % 360
  const sectorIndex = Math.round(bearingDeg / 22.5) % 16
  return CARDINAL_SECTORS[sectorIndex]
}

/**
 * Classifies the age of a lightning strike relative to current time.
 * - fresh: < 3 minutes (white-hot core, expanding shockwave)
 * - recent: 3 to 10 minutes (vivid electric amber)
 * - aging: 10 to 30 minutes (fading orange)
 * - expired: > 30 minutes (culled from display)
 */
export function classifyStrikeAge(
  timeIso: string,
  now = new Date()
): { category: StrikeAgeCategory; ageMinutes: number } {
  const strikeTime = new Date(timeIso).getTime()
  const nowMs = now.getTime()
  const ageMs = Math.max(0, nowMs - strikeTime)
  const ageMinutes = ageMs / (1000 * 60)

  if (ageMinutes <= 3) return { category: 'fresh', ageMinutes }
  if (ageMinutes <= 10) return { category: 'recent', ageMinutes }
  if (ageMinutes <= 30) return { category: 'aging', ageMinutes }
  return { category: 'expired', ageMinutes }
}

/**
 * Projects a geographical coordinate (lat, lon) to Web Mercator canvas pixels relative to a center point.
 */
export function projectStrikeToCanvas(
  strikeLat: number,
  strikeLon: number,
  centerLat: number,
  centerLon: number,
  deltaMeters: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; inBounds: boolean } {
  const centerWeb = latLonToWebMercator(centerLat, centerLon)
  const strikeWeb = latLonToWebMercator(strikeLat, strikeLon)

  const aspect = canvasWidth > 0 && canvasHeight > 0 ? canvasWidth / canvasHeight : 1
  const deltaX = deltaMeters * aspect
  const deltaY = deltaMeters

  const normalizedX = (strikeWeb.x - centerWeb.x + deltaX) / (2 * deltaX)
  const normalizedY = 1 - (strikeWeb.y - centerWeb.y + deltaY) / (2 * deltaY)

  const x = normalizedX * canvasWidth
  const y = normalizedY * canvasHeight

  // Allow a small padding buffer beyond viewport edges
  const pad = 20
  const inBounds =
    x >= -pad && x <= canvasWidth + pad && y >= -pad && y <= canvasHeight + pad

  return { x, y, inBounds }
}

/**
 * Robust XML parser for FMI simple lightning observation features (fmi::observations::lightning::simple).
 * Works reliably in browser DOM and headless test environments without DOMParser dependency.
 */
export function parseFmiLightningXml(
  xmlText: string,
  maxAgeMinutes = 30,
  currentTime = new Date()
): LightningStrike[] {
  if (!xmlText || !xmlText.includes('BsWfs:BsWfsElement')) {
    return []
  }

  // Regexes matching BsWfs elements
  const elementRegex = /<BsWfs:BsWfsElement\s+gml:id="([^"]+)"[\s\S]*?<\/BsWfs:BsWfsElement>/gi
  const posRegex = /<gml:pos>([^<]+)<\/gml:pos>/i
  const timeRegex = /<BsWfs:Time>([^<]+)<\/BsWfs:Time>/i
  const paramNameRegex = /<BsWfs:ParameterName>([^<]+)<\/BsWfs:ParameterName>/i
  const paramValRegex = /<BsWfs:ParameterValue>([^<]+)<\/BsWfs:ParameterValue>/i

  // Group elements by strike index: gml:id="BsWfsElement.<strikeIndex>.<paramIndex>"
  interface RawStrikeGroup {
    id: string
    lat: number
    lon: number
    time: string
    params: Record<string, number>
  }

  const groups = new Map<string, RawStrikeGroup>()

  let match: RegExpExecArray | null
  while ((match = elementRegex.exec(xmlText)) !== null) {
    const gmlId = match[1]
    const block = match[0]

    // Strike base ID from "BsWfsElement.X.Y" -> "strike-X"
    const dotParts = gmlId.split('.')
    const strikeKey = dotParts.length >= 2 ? `strike-${dotParts[1]}` : gmlId

    let group = groups.get(strikeKey)
    if (!group) {
      const posMatch = posRegex.exec(block)
      const timeMatch = timeRegex.exec(block)

      if (!posMatch || !timeMatch) continue

      const coords = posMatch[1].trim().split(/\s+/)
      if (coords.length < 2) continue

      const lat = parseFloat(coords[0])
      const lon = parseFloat(coords[1])
      if (isNaN(lat) || isNaN(lon)) continue

      group = {
        id: strikeKey,
        lat,
        lon,
        time: timeMatch[1].trim(),
        params: {},
      }
      groups.set(strikeKey, group)
    }

    const nameMatch = paramNameRegex.exec(block)
    const valMatch = paramValRegex.exec(block)
    if (nameMatch && valMatch) {
      const pName = nameMatch[1].trim().toLowerCase()
      const pVal = parseFloat(valMatch[1].trim())
      if (!isNaN(pVal)) {
        group.params[pName] = pVal
      }
    }
  }

  const strikes: LightningStrike[] = []

  for (const g of groups.values()) {
    const { category, ageMinutes } = classifyStrikeAge(g.time, currentTime)
    if (category === 'expired' || ageMinutes > maxAgeMinutes) continue

    const cloudInd = g.params['cloud_indicator'] ?? 0
    const isCloudToGround = cloudInd === 0

    strikes.push({
      id: g.id,
      latitude: g.lat,
      longitude: g.lon,
      time: g.time,
      peakCurrentKa: g.params['peak_current'] ?? g.params['peakcurrent'],
      multiplicity: g.params['multiplicity'] ? Math.round(g.params['multiplicity']) : 1,
      isCloudToGround,
      ellipseMajorKm: g.params['ellipse_major'],
    })
  }

  // Sort descending by time (most recent first)
  strikes.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  return strikes
}

/**
 * Aggregates a list of lightning strikes into a high-level ThunderstormStatus.
 */
export function evaluateThunderstormStatus(
  strikes: LightningStrike[],
  centerLat: number,
  centerLon: number,
  maxDistanceKm = 50,
  now = new Date()
): ThunderstormStatus {
  const activeStrikes = strikes.filter((s) => {
    const { category } = classifyStrikeAge(s.time, now)
    return category !== 'expired'
  })

  if (activeStrikes.length === 0) {
    return {
      isActive: false,
      strikes: [],
      recentStrikeCount: 0,
      closestStrikeKm: null,
      closestStrikeBearing: null,
      summary: 'No active thunderstorm',
    }
  }

  // Compute distances to center
  let closestDist = Infinity
  let closestBearing = ''

  for (const s of activeStrikes) {
    const dist = haversineDistanceKm(centerLat, centerLon, s.latitude, s.longitude)
    if (dist < closestDist) {
      closestDist = dist
      closestBearing = calculateBearing(centerLat, centerLon, s.latitude, s.longitude)
    }
  }

  const roundedClosest = closestDist !== Infinity ? Math.round(closestDist * 10) / 10 : null
  const isWithinRadar = closestDist <= maxDistanceKm

  let summary = ''
  if (roundedClosest !== null && isWithinRadar) {
    summary = `Thunderstorm active · ${activeStrikes.length} strike${
      activeStrikes.length === 1 ? '' : 's'
    } (closest ${roundedClosest} km ${closestBearing})`
  } else if (roundedClosest !== null) {
    summary = `Thunderstorm nearby · ${activeStrikes.length} strike${
      activeStrikes.length === 1 ? '' : 's'
    } (${roundedClosest} km ${closestBearing})`
  } else {
    summary = `Thunderstorm detected · ${activeStrikes.length} strikes`
  }

  return {
    isActive: isWithinRadar && activeStrikes.length > 0,
    strikes: activeStrikes,
    recentStrikeCount: activeStrikes.length,
    closestStrikeKm: roundedClosest,
    closestStrikeBearing: closestBearing || null,
    summary,
  }
}

/**
 * Generates realistic fake lightning strike cluster for visual review and demonstration.
 * Creates a localized convective cell 3 to 16 km away with staggered strike ages:
 * - Fresh strikes (<1 min) with peak currents
 * - Recent strikes (3-8 min)
 * - Aging strikes (12-25 min)
 */
export function getMockThunderstormData(
  centerLat: number,
  centerLon: number,
  now = new Date()
): ThunderstormStatus {
  const nowMs = now.getTime()

  // Staggered storm line: strikes distributed realistically along the storm front (4 to 20 km away)
  const mockStrikes: LightningStrike[] = [
    {
      id: 'mock-strike-1',
      latitude: centerLat + 0.04,
      longitude: centerLon + 0.06,
      time: new Date(nowMs - 15 * 1000).toISOString(), // 15s ago (fresh, active discharge)
      peakCurrentKa: -32.4,
      multiplicity: 2,
      isCloudToGround: true,
      ellipseMajorKm: 1.2,
    },
    {
      id: 'mock-strike-2',
      latitude: centerLat + 0.07,
      longitude: centerLon + 0.10,
      time: new Date(nowMs - 75 * 1000).toISOString(), // 1m 15s ago (fresh)
      peakCurrentKa: 24.1,
      multiplicity: 1,
      isCloudToGround: true,
      ellipseMajorKm: 1.5,
    },
    {
      id: 'mock-strike-3',
      latitude: centerLat - 0.03,
      longitude: centerLon + 0.05,
      time: new Date(nowMs - 4.5 * 60 * 1000).toISOString(), // 4.5m ago (recent)
      peakCurrentKa: -18.7,
      multiplicity: 3,
      isCloudToGround: true,
      ellipseMajorKm: 0.9,
    },
    {
      id: 'mock-strike-4',
      latitude: centerLat + 0.11,
      longitude: centerLon + 0.15,
      time: new Date(nowMs - 8 * 60 * 1000).toISOString(), // 8m ago (recent)
      peakCurrentKa: 12.0,
      multiplicity: 1,
      isCloudToGround: false, // Cloud-to-cloud
      ellipseMajorKm: 2.1,
    },
    {
      id: 'mock-strike-5',
      latitude: centerLat - 0.06,
      longitude: centerLon + 0.03,
      time: new Date(nowMs - 16 * 60 * 1000).toISOString(), // 16m ago (aging)
      peakCurrentKa: -45.0,
      multiplicity: 2,
      isCloudToGround: true,
      ellipseMajorKm: 1.8,
    },
    {
      id: 'mock-strike-6',
      latitude: centerLat + 0.15,
      longitude: centerLon + 0.20,
      time: new Date(nowMs - 24 * 60 * 1000).toISOString(), // 24m ago (aging)
      peakCurrentKa: 29.5,
      multiplicity: 1,
      isCloudToGround: true,
      ellipseMajorKm: 1.1,
    },
  ]

  return evaluateThunderstormStatus(mockStrikes, centerLat, centerLon, 50, now)
}
