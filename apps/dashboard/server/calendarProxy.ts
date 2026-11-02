/**
 * The calendar proxy (`/api/ical-proxy?url=…`): fetches an iCal feed the browser cannot fetch
 * itself (most calendar hosts send no CORS headers). One handler serves every runtime: the Vercel
 * edge function, and the self-hosted and Vite servers through `toNodeMiddleware`. It never
 * persists or logs the feed URL or its contents.
 */
import { fetchExternal, type UrlValidator } from './proxySecurity.ts'

export const CALENDAR_PROXY_PATH = '/api/ical-proxy'
const USER_AGENT = 'Meanwhile-Dashboard/1.0'
const CACHE_CONTROL = 'public, max-age=180, s-maxage=300, stale-while-revalidate=600'

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
}

/**
 * `validate` decides which feed URLs may be fetched; it also checks every redirect. Edge runtimes
 * pass `validateExternalHttpUrl`; servers that can resolve DNS pass the stricter
 * `validateResolvableExternalHttpUrl`.
 */
export function createCalendarProxyHandler({ validate }: { validate: UrlValidator }): (request: Request) => Promise<Response> {
  return async request => {
    const target = new URL(request.url).searchParams.get('url')
    if (!target) return jsonError(400, 'Missing "url" query parameter')
    const validation = await validate(target)
    if (validation.error !== undefined) return jsonError(400, validation.error)
    try {
      const upstream = await fetchExternal(validation.url, { headers: { 'User-Agent': USER_AGENT }, validateRedirect: validate })
      if (!upstream.ok) return jsonError(upstream.status, `Upstream returned status ${upstream.status}`)
      return new Response(await upstream.text(), {
        status: 200,
        headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': CACHE_CONTROL },
      })
    } catch (error: unknown) {
      return jsonError(502, error instanceof Error ? error.message : 'Failed to fetch calendar feed')
    }
  }
}
