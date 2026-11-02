import fs from 'node:fs'
import path from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
}

/**
 * The file under `dist` that answers a request path. Anything that is not a file inside `dist`
 * (a client-side route, a directory, or a path that escapes it) gets `index.html`, the
 * single-page-app fallback.
 */
export function resolveStaticFile(dist: string, urlPath: string): string {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.resolve(dist, `.${safePath}`)
  const insideDist = filePath.startsWith(`${path.resolve(dist)}${path.sep}`)
  if (!insideDist || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return path.join(dist, 'index.html')
  return filePath
}

/** Content type and caching: hashed assets are immutable; the page and its build stamp are always revalidated. */
export function staticHeaders(filePath: string): Record<string, string> {
  const extension = path.extname(filePath).toLowerCase()
  const revalidate = extension === '.html' || path.basename(filePath) === 'version.json'
  return {
    'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
    'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=31536000, immutable',
  }
}
