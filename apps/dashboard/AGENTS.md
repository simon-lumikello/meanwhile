# Dashboard rules

These rules add to the repository's [AGENTS.md](../../AGENTS.md) (tooling, shipping, CI,
engineering standard) and [packages/AGENTS.md](../../packages/AGENTS.md) (library rules).
Product background: [README.md](./README.md) and [DESIGN.md](./DESIGN.md).

## Deployment targets
- **Vercel** (meanwhile.lumikello.net, also calendar.lumikello.net; project `meanwhile`): builds
  from this directory (its Root Directory) with `vercel.json`, like the example apps, and serves
  the relays as the Edge Functions in `api/`.
- **Docker** (`ghcr.io/simon-lumikello/meanwhile`, `linux/amd64` and `linux/arm64`,
  published on each GitHub release): the root `Dockerfile` builds the app and bundles
  `server/index.ts` (`bun run build:server`) into one dependency-free Node.js file. The image
  build copies every workspace manifest before its cached install, so a new workspace needs its
  own `COPY` line (`tests/dependency-hygiene.test.ts` enforces it).
- **Local:** the Vite dev and preview servers serve both relays (`dashboardServerRoutes()` in
  `vite.config.ts`).
- **Relays:** `server/calendarProxy.ts` and `server/aircraftRelay.ts` are standard
  `Request` → `Response` handlers, configured once and served by all three targets (Node through
  `toNodeMiddleware`). Edge functions can't resolve DNS, so they validate calendar targets by URL
  (`validateExternalHttpUrl`); Node targets also check DNS (`validateResolvableExternalHttpUrl`).
  The files the Edge Functions reach (`aircraftRelay.ts`, `calendarProxy.ts`, `proxySecurity.ts`)
  import library code by relative source path, as Vercel's edge bundler requires (see
  [packages/AGENTS.md](../../packages/AGENTS.md)); `server/index.ts`, which only Bun bundles, uses
  package names.
- **Aircraft polling:** the dashboard polls one shared Finland snapshot (`?region=finland`) every
  30 seconds; the radar draws whatever part of it is in view. Never make aircraft requests depend
  on the map view: per-view searches while zooming and panning got the upstream to throttle (`429`).
- **Library wiring:** Tailwind scans each rendered library's source (`@source` lines in
  `src/index.css`: radar, ambient, ui, weather), and every Vite config that renders radar
  (`vite.config.ts`, `vite.ambient-controller.config.ts`) registers `maplibreWorkerSource()`.

## Imports
- **Inside `src/`:** files in the same folder import each other by `./` path; anything in another
  folder is imported through the `@dashboard/` alias (`tsconfig.app.json`, `vite.config.ts`), never
  `../`. Libraries come in by package name (`@simon-lumikello/meanwhile-*`).
- **Outside `src/`:** `server/` and `api/` never use the alias: Vercel's edge bundler and Node
  (which loads `server/` from the Vite config) don't read it. Which of those files import library
  source by relative path is under **Relays** above.

## UI & design
- **Terminology:** always **"Lane"** (not "swimlane") in user-facing copy, labels, tooltips, dialogs,
  and user documentation. Internal types such as `SwimlaneConfig` keep their names.
- **Shared controls:** buttons and dialogs come from `@simon-lumikello/meanwhile-ui` (`Button`, `Dialog`);
  change their look or behavior there, not per component. Dialogs close on Escape and on a click
  outside, and a settings dialog edits a draft that only its **Apply** button saves.
- **Themes:** dark, light, and system. Every component, event card, dialog, and contrast border must
  look right in both dark and light.
- **Wall display:** designed for always-on displays (such as a 27" 2560×1440 screen on ChromeOS
  Flex). Keep the UI glanceable from across the room: high contrast, tabular figures for clocks and
  timers, subtle night dimming.

## Night screen (ambient controller)
- **When:** idle during night hours (default 21:00–07:00), or after the day's last event ends
  (`dimAfterLastEvent`), the dashboard-owned ambient controller shows the `ambient` library's
  presentation: a large semibold wall clock (tabular figures) with a dimmer date (`text-white/40`)
  above forecast cards (**Tonight / Rest of Today**, **Tomorrow**, and the optional radar card),
  plus an optional **week ahead** row (off by default; switched in Ambient settings).
- **Dimming:** `backgroundDim` (40–95%, default 80%) and `cardDim` (20–100%, default 70%) set the
  brightness of cards, clock, and date uniformly.
- **Cursor suppression:** while it shows, hide the pointer across the whole overlay
  (`cursor-none [&_*]:cursor-none`).
- **Readiness and transitions:** mount only once the cards are ready (`shouldMountDimmer`), so
  nothing pops in unrendered; fade in and out with the `animate-dimmer-fade-in` and
  `animate-dimmer-fade-out` keyframes.
- **Wake listeners:** global wake listeners (`mousemove`, `keydown`, `touchstart`, `pointerdown`)
  are attached only while the screen is eligible and shown
  (`shouldListenForWake(isEligibleToShow, isLockScreenShown)`), and handlers ignore input while
  inactive (`shouldHandleWake`). An exit transition starts only from a mounted, visible screen;
  `shouldMountDimmer` never mounts an inactive screen just to animate it out. When night hours end
  or events resume, eligibility flips to false and tears down the listeners and wake timers, so
  morning mouse movement never flashes the screen.
- **Wake:** any touch, keypress, or mouse movement wakes the dashboard for 30 seconds.

## Radar composition
- The dashboard composes the library's `RadarViewport` in `AmbientRadarCard.tsx` (night screen:
  non-interactive, no map gestures) and `WeatherRadarOverlay.tsx` (timeline: zooms freely, eases
  back to its preset after two idle minutes). Differentiate them only by viewport size, layout,
  and interactivity. Never reintroduce per-view radar frame URLs or screen-space noise; both break
  seamless zoom.
- The radar timeline and forecast are part of `RadarViewport`, on every interactive radar. Never
  rebuild playback state or a toolbar in the dashboard.

## State
- **Configuration:** settings, Lanes, and display preferences (including the `weatherMap` options
  and the zoom, filter, and render mode remembered from the map's own controls) live in
  `ConfigContext`, backed by `localStorage` under `family_dashboard_config_v1`.
- **Remote data:** TanStack Query polls weather every 3 minutes, calendars every 5, and the aurora
  forecast every 15, in the background without loading flicker (`cache: 'no-cache'`), and
  revalidates on focus after 2 or more idle minutes.

## Privacy & security
- **Zero telemetry:** no analytics, tracking pixels, session recorders, crash reporters, cookies, or
  accounts.
- **Client-side storage:** all user configuration (names, colours, calendar URLs, preferences)
  lives only in the browser's `localStorage`.
- **Calendar proxy:** `/api/ical-proxy` exists only to get around CORS for `.ics` feeds. It must
  never persist, log, or store calendar URLs or event data.
- **Aircraft relay:** `/api/adsb-proxy` forwards only fixed region searches (or, for older clients, a
  rounded location and radius) to `api.adsb.lol`, and never persists or logs requests.
- Keep [PRIVACY.md](./PRIVACY.md), [SELF_HOSTING.md](./SELF_HOSTING.md), and the in-app Privacy
  modal in step with every relay and outbound data source.

## Tests
- Unit tests in `tests/` run under the root `bun test`; browser suites in `e2e/` run against the
  production build (`bun run test:dashboard:e2e`), and the ambient-controller suite runs nightly.
- **Browser test isolation:** every test seeds its own config (`seedDashboardConfig`) and never
  depends on another test's side effects; the suite runs fully parallel. The shared base config uses
  the `radar-blocks` renderer because `realistic-clouds` runs on software WebGL in headless Chromium
  and slows tests roughly 15×; override it only in a test about cloud rendering.
