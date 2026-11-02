# weather-clock rules

These rules add to the repository's [AGENTS.md](../../AGENTS.md) (tooling, shipping, CI,
engineering standard) and [packages/AGENTS.md](../../packages/AGENTS.md) (library rules).

**weather-clock** (weather.lumikello.net; Vercel project `weather-clock`) is a deployed example of
building a separate product on this repository's libraries: it composes `ambient`, `radar`,
`weather`, and `ui` with its own settings and nothing else. Keep it small and idiomatic, since
people read it to learn how to use the libraries.

- **Compose, don't reimplement.** Behavior that another app could reuse belongs in a library under
  `packages/`, changed in the same pull request; this app only wires libraries together.
- **Library wiring:** `src/style.css` lists each rendered library's `src` as a Tailwind `@source`
  (ambient, radar, ui; `tests/tailwind-sources.test.ts` checks it), and `vite.config.ts` registers
  `maplibreWorkerSource()` because the radar card renders a map.
- **Input never dismisses the display:** pointer, touch, and keyboard input leave the clock on screen.
- **One settings dialog** from `@simon-lumikello/meanwhile-ui`: it edits a draft that only **Apply** saves;
  Cancel, Escape, and a click outside discard the edits.
- **Privacy:** the only analytics is Vercel Web Analytics (`<Analytics />` in `src/main.tsx`):
  cookieless page-view counts, no custom events. No other telemetry, cookies, or accounts.
  Settings stay in `localStorage` under `family_ambient_config_v1`.
- **Tests:** unit tests in `tests/` run under the root `bun test`; the browser suite in `e2e/` runs
  against the production build (`bun run test:weather-clock:e2e` from the root, and in CI).
