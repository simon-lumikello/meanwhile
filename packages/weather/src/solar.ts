/**
 * Computes exact sunrise and sunset times (as Date objects with absolute UTC timestamps)
 * for a given date, latitude, and longitude using the standard NOAA solar position model.
 */
export function getSolarTimes(
  date: Date,
  lat = 60.1695,
  lon = 24.9354,
): { sunrise: Date; sunset: Date } {
  // Use local calendar date components so solar times correspond to the observer's local calendar day
  const year = date.getFullYear()
  const startOfYearUtc = Date.UTC(year, 0, 1)
  const dayStartUtc = Date.UTC(year, date.getMonth(), date.getDate())
  const dayOfYear = Math.floor((dayStartUtc - startOfYearUtc) / 86400000) + 1

  // Fractional year in radians
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1)

  // Solar declination (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma)

  // Equation of time in minutes
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))

  // Solar zenith angle for sunrise/sunset is 90.833°
  const zenith = (90.833 * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180

  const cosHourAngle =
    (Math.cos(zenith) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl))

  let hourAngleDeg = 90
  if (cosHourAngle >= 1) {
    // Polar night (sun never rises)
    hourAngleDeg = 0
  } else if (cosHourAngle <= -1) {
    // Midnight sun (sun never sets)
    hourAngleDeg = 180
  } else {
    hourAngleDeg = (Math.acos(cosHourAngle) * 180) / Math.PI
  }

  // Solar noon in minutes from UTC midnight
  const solarNoonUtcMinutes = 720 - 4 * lon - eqtime

  const sunriseUtcMinutes = solarNoonUtcMinutes - hourAngleDeg * 4
  const sunsetUtcMinutes = solarNoonUtcMinutes + hourAngleDeg * 4

  const sunrise = new Date(dayStartUtc + sunriseUtcMinutes * 60 * 1000)
  const sunset = new Date(dayStartUtc + sunsetUtcMinutes * 60 * 1000)

  return { sunrise, sunset }
}

/**
 * Returns true if the given date timestamp falls between sunrise and sunset
 * for the specified location (i.e. daytime), false if nighttime (after sunset or before sunrise).
 */
export function isDaylight(date: Date, lat = 60.1695, lon = 24.9354): boolean {
  const { sunrise, sunset } = getSolarTimes(date, lat, lon)
  const t = date.getTime()
  return t >= sunrise.getTime() && t < sunset.getTime()
}

export interface CelestialLightSource {
  type: 'sun' | 'moon' | 'ambient'
  azimuth: number // degrees (0 = N, 90 = E, 180 = S, 270 = W)
  elevation: number // degrees above horizon
  lightDir: [number, number, number] // normalized 3D light vector in map space (x=E, y=S, z=Up)
  shadowOffset: [number, number] // 2D displacement in UV coordinates (dx, dy)
  shadowStrength: number // 0.0 to 0.5
  isNight: boolean
  label: string
}

/**
 * Computes exact solar position (azimuth and elevation) for a given date,
 * latitude, and longitude using the standard NOAA solar position model.
 */
export function getSolarPosition(
  date: Date,
  lat = 60.1695,
  lon = 24.9354,
): { azimuth: number; elevation: number } {
  const year = date.getFullYear()
  const startOfYearUtc = Date.UTC(year, 0, 1)
  const dayStartUtc = Date.UTC(year, date.getMonth(), date.getDate())
  const dayOfYear = Math.floor((dayStartUtc - startOfYearUtc) / 86400000) + 1

  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1)

  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma)

  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))

  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const timeOffset = eqtime + 4 * lon
  let trueSolarTimeMin = (utcHours * 60 + timeOffset) % 1440
  if (trueSolarTimeMin < 0) trueSolarTimeMin += 1440

  let haDeg = trueSolarTimeMin / 4 - 180
  if (haDeg < -180) haDeg += 360
  if (haDeg > 180) haDeg -= 360

  const haRad = (haDeg * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180

  const sinElevation =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad)
  const elevationRad = Math.asin(Math.max(-1, Math.min(1, sinElevation)))
  const elevationDeg = (elevationRad * 180) / Math.PI

  const cosElevation = Math.cos(elevationRad)
  let azimuthDeg = 180
  if (Math.abs(cosElevation) > 0.0001) {
    const cosAz =
      (Math.sin(decl) - Math.sin(latRad) * sinElevation) /
      (Math.cos(latRad) * cosElevation)
    const clampedCosAz = Math.max(-1, Math.min(1, cosAz))
    azimuthDeg = (Math.acos(clampedCosAz) * 180) / Math.PI
    if (haDeg > 0) {
      azimuthDeg = 360 - azimuthDeg
    }
  }

  return { azimuth: azimuthDeg, elevation: elevationDeg }
}

/**
 * Computes lunar position (azimuth, elevation, illumination fraction, and phase)
 * for a given date, latitude, and longitude using low-precision orbital models.
 */
export function getLunarPosition(
  date: Date,
  lat = 60.1695,
  lon = 24.9354,
): {
  azimuth: number
  elevation: number
  illumination: number
  phaseName: string
} {
  const jd = date.getTime() / 86400000 + 2440587.5
  const d = jd - 2451545.0

  const toRad = Math.PI / 180
  const toDeg = 180 / Math.PI

  const L = (218.316 + 13.176396 * d) % 360
  const M = (134.963 + 13.064993 * d) % 360
  const F = (93.272 + 13.229350 * d) % 360

  const lambda = (L + 6.289 * Math.sin(M * toRad)) % 360
  const beta = 5.128 * Math.sin(F * toRad)
  const eps = 23.439 - 0.00000036 * d

  const lRad = lambda * toRad
  const bRad = beta * toRad
  const epsRad = eps * toRad

  const x = Math.cos(bRad) * Math.cos(lRad)
  const y =
    Math.cos(epsRad) * Math.sin(lRad) * Math.cos(bRad) -
    Math.sin(epsRad) * Math.sin(bRad)
  const z =
    Math.sin(epsRad) * Math.sin(lRad) * Math.cos(bRad) +
    Math.cos(epsRad) * Math.sin(bRad)

  let ra = Math.atan2(y, x) * toDeg
  if (ra < 0) ra += 360
  const dec = Math.asin(z) * toDeg

  const gmst = (280.46061837 + 360.98564736629 * d) % 360
  const lst = (gmst + lon) % 360
  let ha = (lst - ra) % 360
  if (ha < -180) ha += 360
  if (ha > 180) ha -= 360

  const haRad = ha * toRad
  const decRad = dec * toRad
  const latRad = lat * toRad

  const sinElevation =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)
  const elevationRad = Math.asin(Math.max(-1, Math.min(1, sinElevation)))
  const elevationDeg = elevationRad * toDeg

  const cosElevation = Math.cos(elevationRad)
  let azimuthDeg = 180
  if (Math.abs(cosElevation) > 0.0001) {
    const cosAz =
      (Math.sin(decRad) - Math.sin(latRad) * sinElevation) /
      (Math.cos(latRad) * cosElevation)
    const clampedCosAz = Math.max(-1, Math.min(1, cosAz))
    azimuthDeg = Math.acos(clampedCosAz) * toDeg
    if (ha > 0) {
      azimuthDeg = 360 - azimuthDeg
    }
  }

  // Moon illumination phase based on solar elongation
  const sunMeanLong = (280.466 + 0.9856474 * d) % 360
  let elongation = (lambda - sunMeanLong) % 360
  if (elongation < 0) elongation += 360

  const illumination = (1 - Math.cos(elongation * toRad)) / 2

  let phaseName = 'New Moon'
  if (elongation < 22.5 || elongation >= 337.5) phaseName = 'New Moon'
  else if (elongation < 67.5) phaseName = 'Waxing Crescent'
  else if (elongation < 112.5) phaseName = 'First Quarter'
  else if (elongation < 157.5) phaseName = 'Waxing Gibbous'
  else if (elongation < 202.5) phaseName = 'Full Moon'
  else if (elongation < 247.5) phaseName = 'Waning Gibbous'
  else if (elongation < 292.5) phaseName = 'Last Quarter'
  else phaseName = 'Waning Crescent'

  return {
    azimuth: azimuthDeg,
    elevation: elevationDeg,
    illumination,
    phaseName,
  }
}

/**
 * Determines the dominant celestial light source (Sun or Moon) for the given time and coordinates,
 * calculating the 3D unit light vector (in map space: x=East, y=South, z=Up) and 2D shadow
 * offset displacement vector for top-down radar projection.
 */
export function getCelestialLightSource(
  date: Date,
  lat = 60.1695,
  lon = 24.9354,
): CelestialLightSource {
  const toRad = Math.PI / 180
  const solar = getSolarPosition(date, lat, lon)
  const lunar = getLunarPosition(date, lat, lon)

  // Civil sunrise/sunset threshold is approximately -0.833°
  const isDay = solar.elevation > -0.833

  if (isDay) {
    const azRad = solar.azimuth * toRad
    // Effective clamped elevation for lighting and shadow projection
    const effElev = Math.max(3, solar.elevation)
    const elevRad = effElev * toRad

    // 3D vector pointing TOWARDS the Sun
    // In map UV coords: x increases East, y increases South (-North), z is Up
    const lx = Math.sin(azRad) * Math.cos(elevRad)
    const ly = -Math.cos(azRad) * Math.cos(elevRad)
    const lz = Math.sin(elevRad)
    const len = Math.hypot(lx, ly, lz) || 1
    const lightDir: [number, number, number] = [lx / len, ly / len, lz / len]

    // Shadow falls opposite the light direction on the horizontal plane
    // Scaled by solar elevation: higher sun -> shorter shadow; low sun -> longer shadow
    const shadowDist = Math.max(0.015, Math.min(0.055, 0.022 / Math.sin(Math.max(8, solar.elevation) * toRad)))
    const shadowOffset: [number, number] = [
      -Math.sin(azRad) * shadowDist,
      Math.cos(azRad) * shadowDist,
    ]

    // Shadow opacity: darker when sun is high overhead (up to 0.42), slightly softer at low sun
    const elevFactor = Math.min(1, Math.max(0.4, solar.elevation / 45))
    const shadowStrength = 0.28 + 0.14 * elevFactor

    return {
      type: 'sun',
      azimuth: solar.azimuth,
      elevation: solar.elevation,
      lightDir,
      shadowOffset,
      shadowStrength,
      isNight: false,
      label: `Sun (${solar.elevation.toFixed(1)}°, az ${solar.azimuth.toFixed(0)}°)`,
    }
  }

  // Nighttime: check if Moon is above the horizon
  if (lunar.elevation > 0) {
    const azRad = lunar.azimuth * toRad
    const effElev = Math.max(4, lunar.elevation)
    const elevRad = effElev * toRad

    const lx = Math.sin(azRad) * Math.cos(elevRad)
    const ly = -Math.cos(azRad) * Math.cos(elevRad)
    const lz = Math.sin(elevRad)
    const len = Math.hypot(lx, ly, lz) || 1
    const lightDir: [number, number, number] = [lx / len, ly / len, lz / len]

    const shadowDist = Math.max(0.018, Math.min(0.050, 0.020 / Math.sin(Math.max(10, lunar.elevation) * toRad)))
    const shadowOffset: [number, number] = [
      -Math.sin(azRad) * shadowDist,
      Math.cos(azRad) * shadowDist,
    ]

    // Moonlight shadows: scaled by moon phase illumination (full moon = 0.24, crescent = 0.08)
    const shadowStrength = Math.max(0.06, 0.10 + 0.16 * lunar.illumination)

    return {
      type: 'moon',
      azimuth: lunar.azimuth,
      elevation: lunar.elevation,
      lightDir,
      shadowOffset,
      shadowStrength,
      isNight: true,
      label: `${lunar.phaseName} (${lunar.elevation.toFixed(1)}°, az ${lunar.azimuth.toFixed(0)}°)`,
    }
  }

  // Moonless deep night or astronomical twilight fallback
  // Ambient diffuse lighting with subtle directional bias from twilight or moon position
  const azRad = lunar.azimuth * toRad
  const lightDir: [number, number, number] = [
    Math.sin(azRad) * 0.4,
    -Math.cos(azRad) * 0.4,
    0.8,
  ]
  const shadowDist = 0.020
  const shadowOffset: [number, number] = [
    -Math.sin(azRad) * shadowDist,
    Math.cos(azRad) * shadowDist,
  ]

  return {
    type: 'ambient',
    azimuth: lunar.azimuth,
    elevation: lunar.elevation,
    lightDir,
    shadowOffset,
    shadowStrength: 0.08,
    isNight: true,
    label: `Starlight (${lunar.phaseName})`,
  }
}
