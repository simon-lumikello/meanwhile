/**
 * Constructs a Google Maps URL for an event location.
 * If the location already points directly to Google Maps, it is returned as is.
 * Otherwise, it formats a universal Google Maps Search API URL.
 */
export function getGoogleMapsUrl(location: string): string {
  const trimmed = location.trim()
  if (!trimmed) return ''

  // If already a Google Maps URL, return directly
  if (
    /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl)/i.test(
      trimmed
    )
  ) {
    return trimmed
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`
}
