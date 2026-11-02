# Library Rules & AI Steering

These rules add to the repository's [AGENTS.md](../AGENTS.md), which covers the package manager,
shipping, CI, documentation hygiene, and the engineering standard for the whole workspace.

`packages/` holds the reusable `@simon-lumikello/meanwhile-*` libraries: `weather`, `radar`, `ambient`, `ui`,
and `relay`. They are internal workspace packages: never built, versioned, or published. Each
`package.json` exports explicit subpaths that point at TypeScript source, and every app compiles
them as its own code. A library change ships like any other change, in one pull request with the
app code it affects. `radar` and `ambient` always mean the libraries, never the weather-map and
weather-clock apps.

## Weather Forecasting, Radar & Solar Engine Steering
- **Daytime-Weighted Dominant Condition:** When computing dominant weather for the day, evaluate active daytime hours (07:00–21:00) when people are awake and outdoors. An isolated overnight shower must never label an otherwise dry day as "Heavy Rain". Reserve "Heavy Rain" for sustained heavy rainfall ($\ge 15\text{–}20\text{ mm}$); moderate precipitation (2–15 mm) is classified as "Showers / Rain".
- **Winter Weather & Freezing Precipitation:** In sub-zero temperatures ($< 0^\circ\text{C}$), precipitation must be mapped and rendered as snow or sleet (`snow-light`, `snow-heavy`, `sleet`), never as liquid rain. Dominant symbols must elevate to snow during freezing conditions.
- **Window-Aware Dayparts:** Morning (06–12), Afternoon (12–18), and Evening (18–24) dayparts must evaluate the full period window to pick peak rain/severity events, ensuring school and commute showers are never masked by an arbitrary single-hour sample.
- **Precipitation Timeline & Rain Chart:**
  - Render a 24-hour histogram bar chart showing rainfall timing, peak amounts, and clean time axis.
  - Symmetrical display rule: If *either* card has rain, both cards display their timeline (the rainless card shows a subtle flat baseline with `Dry through midnight` / `Dry throughout the day`); if *both* cards are dry, the timeline is hidden on both cards.
  - Values-first summary: Always prioritize time windows and numeric peak values (e.g. `~00:00–13:00 · peak 1.5 mm at 05:00`), avoiding verbose padding phrases that cause UI truncation.
  - Full-row stretch: Both upcoming hours and daypart pills must use `flex gap-2 w-full [&>*]:flex-1` to stretch across 100% of the row width.
- **Astronomical Solar Calculator:** Use NOAA UTC-based solar mathematics (`weather/src/solar.ts`) with the configured coordinates to determine exact sunrise and sunset times. Automatically swap sun icons for moon icons during nighttime hours.
- **Continuous Auto-Refresh:** Weather forecasts must be polled every 3 minutes (`3 * 60 * 1000`) in the background without triggering loading state flickers, using `{ cache: 'no-cache' }` to prevent stale browser responses, and immediately revalidating upon window focus/visibility after $\ge 2$ minutes of inactivity.
- **Aurora Borealis & Space Weather:** Operates via decoupled NOAA SWPC planetary $K_p$ forecasting (`weather/src/aurora.ts` and `auroraEvaluation.ts`), scaling required thresholds by latitude ($\ge 2.5$ for Lapland, $\ge 3.5$ for Central Finland, $\ge 4.5$ for Southern Finland / Baltics). Triggers Northern Lights ambient glow only when astronomical darkness and clear skies align. Keep pill labels concise (e.g. `✨ Aurora · Kp X.X`).
- **Weather Radar Component Architecture (`RadarViewport`):**
  - All weather radar displays must build on top of the unified presentation layer: `RadarViewport.tsx`.
  - Both the dashboard's ambient lockscreen radar card (`apps/dashboard/…/AmbientRadarCard.tsx`) and the timeline radar widget (`LiveRadarMap.tsx`) share identical core rendering logic: EPSG:3857 Web Mercator coordinate projections, basemap canvas (`RadarBasemapCanvas.tsx`), cloud/Doppler radar canvas (`CloudRadarCanvas.tsx`), wind vectors (`RadarWindBadge.tsx`), and rain proximity telemetry.
  - Omit redundant title labels (e.g. `[Location] Radar`) in favor of glanceable telemetry pills (`RadarWindBadge` + instant rain/dry reading).
  - Differentiate lockscreen and timeline instances strictly by viewport dimensions, layout constraints, and interactive controls vs. non-interactive display.
- **Radar Timeline & Nowcast:** The timeline lives in `RadarViewport`, so every interactive radar has it; hosts never hold playback state. Scans play at once; the forecast joins the track only when every frame is rendered, with progress shown until then, and the timeline always labels a forecast frame as one. The nowcast (`nowcast.ts`, pure and resolution-independent) measures echo motion from recent scans, falls back to and blends towards the source's `steeringWinds()` with lead time, and never invents growth or decay. Heavy work runs in short slices off the render loop, only while the timeline is open. Judge changes to it against persistence with real scans, not by eye.

## Libraries Own No Application State
- **Configuration & Preferences belong to applications:** Libraries never own settings, storage, or a QueryClient. Applications pass options (radar styles, zoom, basemap toggles, locations) as explicit props or source configuration, and run shared query hooks under their own provider.
- **No Storage in Libraries:** Libraries never read or write `localStorage`, cookies, or any other persistence; user configuration belongs to each application.
- **Relay Pass-Through:** `@simon-lumikello/meanwhile-relay` handlers exist solely to bypass browser CORS limitations. They validate and normalise input before it reaches an upstream URL and must never persist or log request data.

## Library Contracts & Verification
- **Names:** every library, and every app with a scoped name, is called `@simon-lumikello/meanwhile-<name>`, so other projects under the scope can use generic names like `ui`. The boundary check enforces the prefix and treats any other `@simon-lumikello/*` package as an external dependency.
- **Public entry points only:** every package exports explicit subpaths that point at files under its `src/`; apps and other libraries import only those subpaths, never a deep path. `bun run check:boundaries` enforces this, the layering (core ← providers ← query; react → core only), that a library imports only packages its `package.json` declares, and that the server-only `relay` package stays out of browser libraries.
- **Node-loaded code uses explicit extensions:** a Vite config imports `relay`, `ui/vite`, and `radar/vite`, and Node runs that source directly (it strips the types but resolves only exact file names). Relative imports in those files carry their `.ts` extension and use only erasable TypeScript syntax; the boundary check enforces the extensions.
- **Vercel edge functions import library source by relative path:** Vercel's edge bundler compiles TypeScript only along relative imports from TypeScript files; a library reached through its package name (a `.ts` file in `node_modules`) or from a `.js` file is an "unsupported module" and fails the deployment. An app's edge function therefore imports its relay setup from a TypeScript file that imports `packages/relay/src/…` by relative path (the dashboard's `apps/dashboard/server/aircraftRelay.ts`, weather-map's `apps/weather-map/server/aircraftRelay.ts`).
- **The MapLibre worker plugin:** radar's map chunk imports `virtual:maplibre-worker-source`, which `maplibreWorkerSource()` from `@simon-lumikello/meanwhile-radar/vite` provides. Every Vite config that renders radar registers it, or the build fails to resolve the module.
- **Consumer styling:** `radar`, `ambient`, and `ui` components use Tailwind utilities; every app that renders them adds each such package's `src` as a Tailwind `@source` (radar's controls come from `ui`, so rendering radar needs `ui` too). Each app also imports the stylesheets of the packages it uses once (`@simon-lumikello/meanwhile-{weather,radar,ambient}/style.css`).
- **Singleton peers:** `react`, `react-dom`, and `@tanstack/react-query` are peer dependencies, never regular dependencies (`scripts/package-hygiene.test.ts`).
- **Browser acceptance:** each package with UI owns a deterministic browser fixture (`packages/*/e2e/fixture`) that imports its public entry points, blocks unexpected network requests, and runs under Playwright (`bun run test:libraries:e2e`, in CI on every pull request).
- **Cloud rendering:** `bun run test:radar:visual` renders `CloudRadarCanvas` against pixel-exact, Windows-rendered baselines, so CI cannot run it. Run it locally on Windows before shipping any change to cloud rendering, and never accept new baselines without reviewing them.
- **Documentation:** keep [README.md](./README.md) and each package README (entry points, host wiring, styling) in step with the code.
