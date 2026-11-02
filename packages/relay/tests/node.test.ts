import { afterAll, beforeAll, expect, test } from 'bun:test'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { toNodeMiddleware } from '../src/node'

const seen: Array<{ method: string; url: string; header: string | null }> = []
const middleware = toNodeMiddleware(async (request) => {
  seen.push({ method: request.method, url: request.url, header: request.headers.get('x-probe') })
  if (new URL(request.url).searchParams.has('boom')) throw new Error('handler failed')
  return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'Content-Type': 'application/json', 'X-Relay': 'yes' } })
})

let server: http.Server
let origin = ''

beforeAll(async () => {
  server = http.createServer((req, res) => void middleware(req, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

test('forwards method, path, query, and headers and writes the handler response', async () => {
  const response = await fetch(`${origin}/api/adsb-proxy?lat=60.17&lon=24.94`, { headers: { 'X-Probe': 'present' } })
  expect(response.status).toBe(201)
  expect(response.headers.get('x-relay')).toBe('yes')
  expect(await response.json()).toEqual({ ok: true })
  expect(seen.at(-1)).toEqual({ method: 'GET', url: 'http://localhost/api/adsb-proxy?lat=60.17&lon=24.94', header: 'present' })
})

test('omits the body for HEAD requests', async () => {
  const response = await fetch(`${origin}/api/adsb-proxy?lat=1&lon=1`, { method: 'HEAD' })
  expect(response.status).toBe(201)
  expect(await response.text()).toBe('')
})

test('turns a handler failure into a JSON 500', async () => {
  const response = await fetch(`${origin}/api/adsb-proxy?boom=1`)
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'handler failed' })
})
