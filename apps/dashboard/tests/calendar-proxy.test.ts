import { afterEach, describe, expect, it, mock } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stubFetch } from './support/stubFetch'
import { createCalendarProxyHandler } from '../server/calendarProxy.ts'
import { validateExternalHttpUrl } from '../server/proxySecurity.ts'
import { resolveStaticFile, staticHeaders } from '../server/staticFiles.ts'

const proxy = createCalendarProxyHandler({ validate: validateExternalHttpUrl })
const request = (target?: string) => new Request(`http://localhost/api/ical-proxy${target ? `?url=${encodeURIComponent(target)}` : ''}`)
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function respondWith(response: Response) {
  const handler = mock(async () => response)
  globalThis.fetch = stubFetch(handler)
  return handler
}

describe('calendar proxy', () => {
  it('rejects a missing or unsafe target before any fetch', async () => {
    const stub = respondWith(new Response('never'))
    expect((await proxy(request())).status).toBe(400)
    const unsafe = await proxy(request('http://169.254.169.254/latest/meta-data'))
    expect(unsafe.status).toBe(400)
    expect(await unsafe.json()).toEqual({ error: 'Private network addresses are not allowed' })
    expect(stub).not.toHaveBeenCalled()
  })

  it('returns the feed as cacheable text/calendar with CORS', async () => {
    respondWith(new Response('BEGIN:VCALENDAR\nEND:VCALENDAR', { status: 200 }))
    const response = await proxy(request('https://calendar.example.com/family.ics'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Cache-Control')).toContain('max-age=180')
    expect(await response.text()).toBe('BEGIN:VCALENDAR\nEND:VCALENDAR')
  })

  it('passes an upstream error status through as JSON', async () => {
    respondWith(new Response('gone', { status: 404 }))
    const response = await proxy(request('https://calendar.example.com/missing.ics'))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Upstream returned status 404' })
  })

  it('refuses a redirect to a private address', async () => {
    respondWith(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }))
    const response = await proxy(request('https://calendar.example.com/redirect.ics'))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Private network addresses are not allowed' })
  })
})

describe('self-hosted static files', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-dist-'))
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html>')
  fs.mkdirSync(path.join(dist, 'assets'))
  fs.writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), '')

  it('serves files inside dist and falls back to index.html for everything else', () => {
    expect(resolveStaticFile(dist, '/assets/app-abc123.js')).toBe(path.join(dist, 'assets', 'app-abc123.js'))
    expect(resolveStaticFile(dist, '/settings/lanes')).toBe(path.join(dist, 'index.html'))
    expect(resolveStaticFile(dist, '/assets')).toBe(path.join(dist, 'index.html'))
    expect(resolveStaticFile(dist, '/../../etc/passwd')).toBe(path.join(dist, 'index.html'))
  })

  it('caches hashed assets forever and revalidates the page and its build stamp', () => {
    expect(staticHeaders(path.join(dist, 'assets', 'app-abc123.js'))['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(staticHeaders(path.join(dist, 'index.html'))).toEqual({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
    expect(staticHeaders(path.join(dist, 'version.json'))['Cache-Control']).toBe('no-cache')
  })
})
