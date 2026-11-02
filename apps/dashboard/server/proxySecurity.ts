/**
 * URL safety for the calendar proxy: which targets it may fetch, and fetching them without
 * following a redirect to somewhere it may not. Runs on edge runtimes and Node alike; the
 * DNS-resolving check that needs Node lives in `proxySecurity.node.ts`.
 */

export type UrlValidation = { url: URL; error?: never } | { error: string; url?: never }

export type UrlValidator = (value: string) => UrlValidation | Promise<UrlValidation>

const PRIVATE_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal']

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [first, second] = parts
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  )
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('::ffff:')
  )
}

/**
 * Validates a user-configured proxy target before it reaches fetch: http(s) only, no embedded
 * credentials, and no private or loopback hostname or literal address. DNS is not consulted
 * here (edge runtimes cannot); `fetchExternal` re-validates every redirect instead.
 */
export function validateExternalHttpUrl(value: string): UrlValidation {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { error: 'Invalid URL format' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'Only http and https protocols are allowed' }
  if (url.username || url.password) return { error: 'URLs with embedded credentials are not allowed' }
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || PRIVATE_HOSTNAME_SUFFIXES.some(suffix => hostname.endsWith(suffix)) || isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    return { error: 'Private network addresses are not allowed' }
  }
  return { url }
}

export function isBlockedIpAddress(address: string): boolean {
  return isPrivateIpv4(address) || isPrivateIpv6(address)
}

export interface FetchExternalOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  maxRedirects?: number
  /** Checks every redirect target before it is followed (default: `validateExternalHttpUrl`). */
  validateRedirect?: UrlValidator
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const DEFAULT_MAX_REDIRECTS = 5
const DEFAULT_TIMEOUT_MS = 10_000

/** Fetches a validated URL, following redirects manually so each target is validated first. */
export async function fetchExternal(url: URL, options: FetchExternalOptions = {}): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    let currentUrl = url
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
    const validateRedirect = options.validateRedirect ?? validateExternalHttpUrl
    for (let redirectCount = 0; ; redirectCount += 1) {
      const response = await fetch(currentUrl, { headers: options.headers, redirect: 'manual', signal: controller.signal })
      if (!REDIRECT_STATUSES.has(response.status)) return response
      const location = response.headers.get('location')
      if (!location) return response
      if (redirectCount >= maxRedirects) throw new Error('Too many redirects from external feed')
      const validation = await validateRedirect(new URL(location, currentUrl).toString())
      if (validation.error !== undefined) throw new Error(validation.error)
      currentUrl = validation.url
    }
  } finally {
    clearTimeout(timeout)
  }
}
