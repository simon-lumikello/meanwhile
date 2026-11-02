# @simon-lumikello/meanwhile-relay

Server-side, same-origin relays for data that browsers cannot fetch directly.
Browser libraries such as `@simon-lumikello/meanwhile-radar` call a relay path on their own
origin; the application serves that path with a handler from this package.

This is a server-only library. It has no React or DOM dependencies, and browser
libraries must not depend on it (enforced by `bun run check:boundaries`).

An internal workspace package of this repository: depend on it with `"workspace:*"`; apps
compile its TypeScript source (see the [libraries README](../README.md)).
A Vite config or Node server loads it directly, so its relative imports carry their `.ts`
extension (enforced by `bun run check:boundaries`).

## `./aircraft`: live ADS-B aircraft positions

The ADS-B upstream (`api.adsb.lol`) sends no CORS headers, so the radar
library's aircraft overlay needs a relay.

```ts
import { createAircraftRelayHandler } from '@simon-lumikello/meanwhile-relay/aircraft'

const relay = createAircraftRelayHandler({
  userAgent: 'MyProduct/1.0 (contact)', // required: identifies your product upstream
})
```

`relay` is a standard `(request: Request) => Promise<Response>` handler and runs
unchanged on edge runtimes, Bun, and Node 18+.

- **Request:** `GET ?lat=&lon=&dist=` (radius in nautical miles). The legacy
  OpenSky bounding box `?lamin=&lamax=&lomin=&lomax=` is also accepted.
- **Region request:** `GET ?region=<name>` for a region configured in `regions`.
  The relay runs the region's covering searches one after another, keeps only aircraft
  inside its outline (once each), and answers `{ now, ac: [...] }` with just the
  fields the radar draws. The URL is the same for every viewer, so one CDN or
  in-process cache entry serves them all. Unknown names get `400`.
- **Response:** the upstream JSON (`{ ac: [...] }`), with `Cache-Control`
  headers for CDN caching. Failures return `{ error, ac: [] }`.
- **Validation:** coordinates must be finite and in range; the radius is clamped
  to `maxRadiusNm` (default 250). Only normalised numbers reach the upstream URL.
  Methods other than `GET`/`HEAD` get `405`.

`FINLAND_AIRSPACE` covers Finland's land territory and territorial waters,
including Åland, with a coarse outline and two upstream searches:

```ts
import { createAircraftRelayHandler, FINLAND_AIRSPACE } from '@simon-lumikello/meanwhile-relay/aircraft'

const relay = createAircraftRelayHandler({ userAgent: 'MyProduct/1.0 (contact)', regions: { finland: FINLAND_AIRSPACE } })
```

Options:

| Option | Purpose |
| --- | --- |
| `userAgent` | Required product identification sent upstream. |
| `maxRadiusNm` | Upper bound for the requested radius. |
| `regions` | Named `AircraftRegion`s (`{ searches, outline }`) served as merged snapshots. |
| `regionCacheSeconds` | How long the CDN keeps a region snapshot (default 25). Each expiry costs one relay run and its upstream searches, so a longer time means fewer runs and older positions. |
| `searchSpacingMs` | Pause between a region's searches (default 1000); the upstream throttles bursts, even two requests at once. A throttled search (`429` or `420`) is retried once after twice this pause, and a remaining throttle is reported as `429`. |
| `cache` | `{ freshMs, staleFallbackMs, maxEntries? }` in-process cache for long-running servers; serves a recent response when the upstream fails. On edge runtimes the CDN does the main caching, and this helps only while an instance stays warm. |
| `fetch` | Transport override for tests. |

### Vercel Edge Function

```ts
// api/adsb-proxy.ts
import { createAircraftRelayHandler } from '@simon-lumikello/meanwhile-relay/aircraft'

export const config = { runtime: 'edge' }
export default createAircraftRelayHandler({ userAgent: 'MyProduct/1.0 (contact)' })
```

## `./node`: Node and Vite middleware

`toNodeMiddleware(handler)` adapts any relay handler to Node `(req, res)`
middleware for `node:http` servers and the Vite dev/preview servers.

```ts
import { createAircraftRelayHandler } from '@simon-lumikello/meanwhile-relay/aircraft'
import { toNodeMiddleware } from '@simon-lumikello/meanwhile-relay/node'

const relay = toNodeMiddleware(createAircraftRelayHandler({
  userAgent: 'MyProduct/1.0 (contact)',
  cache: { freshMs: 25_000, staleFallbackMs: 10 * 60 * 1000 },
}))

// Vite plugin
export const aircraftRelay = {
  name: 'aircraft-relay',
  configureServer: (server) => { server.middlewares.use('/api/adsb-proxy', relay) },
  configurePreviewServer: (server) => { server.middlewares.use('/api/adsb-proxy', relay) },
}
```
