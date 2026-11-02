# weather-map rules

These rules add to the repository's [AGENTS.md](../../AGENTS.md) (tooling, shipping, CI,
engineering standard) and [packages/AGENTS.md](../../packages/AGENTS.md) (library rules).

**weather-map** (map.lumikello.net; Vercel project `weather-map`) is a deployed example of building
a separate product on this repository's libraries: a full-window `radar` with live aircraft from
its own `relay`, plus `weather` readings and `ui` controls. Keep it small and idiomatic, since
people read it to learn how to use the libraries.

- **Compose, don't reimplement.** Behavior that another app could reuse belongs in a library under
  `packages/`, changed in the same pull request; this app only wires libraries together.
- **Library wiring:** `src/style.css` lists each rendered library's `src` as a Tailwind `@source`
  (radar, ui; `tests/tailwind-sources.test.ts` checks it, and the radar canvases once lost their
  size without it), and `vite.config.ts` registers `maplibreWorkerSource()`.
- **Aircraft relay:** configured once in `server/aircraftRelay.ts` and served by the Vercel edge
  function `api/adsb-proxy.ts` and the Vite dev and preview servers. It imports the relay library
  by relative source path (Vercel's edge bundler compiles TypeScript only along relative imports;
  see [packages/AGENTS.md](../../packages/AGENTS.md)). The app polls one Finland snapshot
  (`?region=finland`) every 30 seconds; never make aircraft requests follow the map view.
- **One settings UI:** the map's own Settings button opens the app's dialog (`onOpenSettings`),
  which carries the map's style choices as `RadarSettingsFields`. The dialog edits a draft that
  only **Apply** saves. Don't add a second settings button or dialog.
- **Privacy:** the only analytics is Vercel Web Analytics (`<Analytics />` in `src/main.tsx`):
  cookieless page-view counts, no custom events. No other telemetry, cookies, or accounts.
  Settings stay in `localStorage` under `family_radar_config_v1`.
- **Tests:** unit tests in `tests/` run under the root `bun test`; the browser suite in `e2e/` runs
  against the production build (`bun run test:weather-map:e2e` from the root, and in CI).
