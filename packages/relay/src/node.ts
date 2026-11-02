import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RelayHandler } from './aircraft.ts'

export type NodeMiddleware = (request: IncomingMessage, response: ServerResponse) => Promise<void>

/**
 * Adapts a standard `Request` → `Response` relay handler to Node `(req, res)`
 * middleware, for `node:http` servers and the Vite/Connect dev server.
 *
 * Only the path and query of the incoming request are forwarded. The relay
 * handlers ignore request bodies, so none is read.
 */
export function toNodeMiddleware(handler: RelayHandler): NodeMiddleware {
  return async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const result = await handler(new Request(url, { method: request.method ?? 'GET', headers: toHeaders(request.headers) }))
      response.statusCode = result.status
      result.headers.forEach((value, name) => response.setHeader(name, value))
      response.end(request.method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer()))
    } catch (error: unknown) {
      if (!response.headersSent) {
        response.statusCode = 500
        response.setHeader('Content-Type', 'application/json')
      }
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Relay failed' }))
    }
  }
}

function toHeaders(incoming: IncomingMessage['headers']): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item))
    else if (value !== undefined) headers.set(name, value)
  }
  return headers
}
