import { describe, expect, it } from 'bun:test'
import { getGoogleMapsUrl } from '@dashboard/features/timeline/maps'

describe('Google Maps URL generator', () => {
  it('generates a valid Google Maps search URL for address or place name', () => {
    expect(getGoogleMapsUrl('Mannerheimintie 1, Helsinki')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Mannerheimintie%201%2C%20Helsinki'
    )
    expect(getGoogleMapsUrl('Central Park, New York')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Central%20Park%2C%20New%20York'
    )
  })

  it('handles leading and trailing whitespace', () => {
    expect(getGoogleMapsUrl('   Oodi Library   ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Oodi%20Library'
    )
  })

  it('returns empty string for empty or blank location', () => {
    expect(getGoogleMapsUrl('')).toBe('')
    expect(getGoogleMapsUrl('   ')).toBe('')
  })

  it('returns existing Google Maps URLs directly without double-encoding', () => {
    const mapsUrl = 'https://maps.google.com/?q=60.1699,24.9384'
    expect(getGoogleMapsUrl(mapsUrl)).toBe(mapsUrl)

    const shortUrl = 'https://goo.gl/maps/abc123xyz'
    expect(getGoogleMapsUrl(shortUrl)).toBe(shortUrl)

    const appUrl = 'https://maps.app.goo.gl/xyz789'
    expect(getGoogleMapsUrl(appUrl)).toBe(appUrl)
  })
})
