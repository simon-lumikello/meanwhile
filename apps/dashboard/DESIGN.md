# Meanwhile — System Design Document

**Document Version:** 1.2.0  
**Target Hardware:** 2011 27-inch Apple iMac (2560 × 1440 QHD / 2.5K 16:9 Display) & Wall/Desk Kiosks  
**Operating System:** Chrome OS Flex, Linux, macOS, Windows  
**Status:** In production  

---

## 1. Executive Summary & Vision

**Meanwhile** is a dedicated, always-on wall/desk dashboard application designed to give a household an immediate, glanceable view of the day. 

It organizes the current day as an interactive, synchronised **multi-lane timeline**, where each lane represents a family member's schedule (Google Calendar via secret iCal link) or a real-time environmental/contextual feed (e.g., hourly weather forecast).

### Key Product Highlights
- **Glanceable Timeline:** The entire day visualized along a continuous axis with a live **"Playhead"** indicator marking the exact current time down to the minute.
- **Configurable Family Lanes:** Independent color-coded lanes for each family member or information source, complete with custom titles, Lucide icons, and curated color palettes. *(Note: User-facing UI and documentation standardizes on "Lane", while internal TypeScript interfaces retain `SwimlaneConfig` for backward compatibility).*
- **Dynamic Orientation:** Instant toggle between **Horizontal (Left-to-Right)** and **Vertical (Top-to-Bottom)** time progression.
- **Past Event Treatment & Split Muting:** Configurable treatment of past events (full vibrancy or dimmed/muted), with an active split-progress bar for events currently underway.
- **Dual Themes (Dark / Light / System):** Architectural dark mode, clean high-contrast light mode, or automatic system preference following, with an early inline boot script to eliminate theme flashing.
- **Chrome OS Flex & Kiosk Optimized:** Designed to run like a native appliance (PWA / Kiosk mode) on high-resolution displays (e.g. 27" 2560×1440), with ambient night dimming for 24/7 operation.
- **Privacy-First & Zero Accounts:** Zero cloud tracking, no cookies, no analytics, no third-party database. All configuration lives strictly in browser `localStorage`.
- **Multi-Target Deployment:** Official multi-arch Docker image (`linux/amd64`, `linux/arm64`) for home servers / Raspberry Pi, Vercel Edge deployment, or zero-config local development.

---

## 2. Hardware Target & Platform Constraints

| Attribute | Specification | Design Implication |
|---|---|---|
| **Display Resolution** | 2560 × 1440 (16:9 QHD, ~109 PPI) | Ample screen real estate. Layout spans full width without horizontal scrolling. High-contrast typography readable from 2–3 meters away. |
| **Panel Technology** | IPS LCD (2011 Apple Cinema/iMac panel) | Susceptible to image retention if high-contrast static elements stay fixed 24/7. Mitigated via ambient night mode dimming and dynamic date transitions. |
| **Target OS** | Chrome OS Flex / Linux / macOS / Windows | Supports Chromium fullscreen / PWA standalone mode and Chrome Kiosk mode (`--kiosk`). |
| **GPU / CPU Specs** | Intel Sandy Bridge (2nd Gen i5/i7) to modern ARM64 (Raspberry Pi 4/5) | Smooth 60fps rendering via hardware-accelerated CSS transforms and composited animations. Avoid heavy 3D shaders or layout thrashing. |

---

## 3. Architecture & Technology Stack

### Core Stack
- **Runtime & Tooling:** **Bun** (see `package.json` for pinned version). Fast package management, bundling, test execution (`bun test`), and TypeScript execution.
- **Frontend Framework:** **React** + **Vite** + **TypeScript**. Reactive, zero-bloat production build with fast HMR.
- **Styling Engine:** **Tailwind CSS** (`@tailwindcss/vite`) + native CSS Custom Properties for dynamic timeline coordinates and lane theme tokens.
- **Iconography:** **Lucide React** (`lucide-react`) for clean, modern icons across lane categories, navigation, and controls.
- **Data Sync & Cache:** **TanStack Query** (React Query) for automated polling, stale-while-revalidate data fetching, and background cache refresh.
- **Date Math & Parsing:** **`date-fns`** + custom RFC 5545 iCal parser engine.
- **Linter:** **`oxlint`** for ultra-fast static code analysis.
- **PWA & Standalone Display:** Native Web App Manifest (`public/manifest.json`) configured for `display: standalone` and `orientation: landscape`, complete with SVG icons and color scheme metadata.

### Deployment & Relay Architecture

Google Calendar iCal feeds and the ADS-B aircraft feed block direct browser fetches (CORS), so the
dashboard serves two same-origin relays: the calendar relay (`/api/ical-proxy`) and the aircraft
relay (`/api/adsb-proxy`, with the legacy `/api/opensky-proxy` alias). Each is one standard
`Request` → `Response` handler in `server/` (`calendarProxy.ts`, `aircraftRelay.ts` on top of
`@simon-lumikello/meanwhile-relay`), served unchanged by three execution targets:

| Target | Serves the app | Serves the relays |
| --- | --- | --- |
| **Docker / self-hosted** (the privacy recommendation) | `server/index.ts`, bundled into one dependency-free file (`bun run build:server`) on Node.js; static assets with an `index.html` fallback | The same process, through `toNodeMiddleware`; calendar targets are also checked against DNS |
| **Vercel** | Static build of `apps/dashboard` | Edge Functions in `api/` (`ical-proxy.ts`, `adsb-proxy.ts`, `opensky-proxy.ts`) |
| **Local development** | Vite dev server (`bun run dev`, http://localhost:5173) | The dev and preview servers, through the `dashboard-server-routes` plugin in `vite.config.ts` |

The weather, radar, ambient, UI, and relay code lives in the workspace libraries under
`packages/`, which every target compiles from source. The multi-arch image
(`ghcr.io/simon-lumikello/meanwhile`, `amd64` and `arm64`) is published on each GitHub
release.

---

## 4. Timeline & Lane Engine Specification

### 4.1. Core Timeline Modes

Default orientation is **Horizontal (Left-to-Right)** spanning the full screen width, with instant toggle to **Vertical (Top-to-Bottom)**.

```
+-----------------------------------------------------------------------------------------------------------------------------+
| [‹ Prev] [Today ⚡] [Next ›] | Saturday, Sep 5, 2026 | 10:43 AM (Now) | [Back to Today ↺] | 21°C ⛅ | [Settings ⚙️] [⇄ Rotate] |
+-----------------------------------------------------------------------------------------------------------------------------+
| HORIZONTAL TIMELINE (Full 24h Day across full display width: 00:00 -> 24:00)                                                |
| 00:00   02:00   04:00   06:00   08:00   10:00   | [10:43]   12:00   14:00   16:00   18:00   20:00   22:00                   |
|                                                 | (PLAYHEAD)                                                                |
| Lane 1 (Dad):       ░░░░░░[ Gym ]░░░░░░         |  [ Deep Work ]             [ Family Dinner ]                              |
| Lane 2 (Mom):                   ░░░░[ Yoga ]░░░ |   [ Design Review ]                                                       |
| Lane 3 (Kids):      ░░░░░░[ School Bus ]░░░░░░░░|====[ In School ]======>   [ Soccer Practice ]                             |
|                     (past: muted)               | (future: vibrant)                                                         |
| Lane 4 (Weather):   14°   15°   16°   18°   20° | 21°C ⛅   22°C ☀️   23°C ☀️   19°C 🌙   16°C 🌙                            |
+-----------------------------------------------------------------------------------------------------------------------------+
```

### 4.2. Time Window & Grid Layout
- **Full Day Visibility:** The entire day (00:00 to 24:00) spans the full width of the screen. No horizontal scrolling is needed on high-resolution displays.
- **Playhead:** A high-visibility laser indicator marking the current time down to the minute, paired with a real-time digital clock badge.
- **Zebra Striping & Grid Intensity:** Alternating subtle row backgrounds (`zebraStriping`) and configurable vertical/horizontal grid lines (`subtle`, `medium`, `vivid`) provide clear visual tracking across wide screens.
- **Overlapping Event Collision Tracks:** When multiple events in the same lane overlap in time, the layout engine automatically assigns independent non-colliding sub-tracks.

### 4.3. Past Event Treatment & Split-Progress Muting
- **Preserved Spatial Context:** Past events remain visible to preserve temporal context.
- **Mute Toggle (ON / OFF):**
  - **When Muting is ON (Default):**
    - Completed events are dimmed with reduced opacity.
    - **Active Split-Progress Muting:** If an event is currently underway (starts before playhead and ends after), the elapsed portion is darkened/muted while the remaining duration stays brightly highlighted, serving as a clean natural progress bar.
  - **When Muting is OFF:** All events display in full vibrant theme color.

### 4.4. Day Navigation & Kiosk "Return to Today"
- **Interactive Navigation:** Single-day stepping chevrons `[ ‹ ]` / `[ › ]`, quick `[ Today ]` shortcut, and animated slide transitions.
- **"Back to Today ↺" Button:** When viewing yesterday, tomorrow, or future dates, an illuminated reminder button appears in the navigation bar.
- **Kiosk Auto-Reset Idle Timer:** When left idle on non-current dates, the dashboard automatically snaps back to "Today" after a configurable inactivity threshold (default 2 minutes).

---

## 5. Lane Architecture & Data Connectors

### 5.1. Data Models

```typescript
export type SwimlaneType = 'google-calendar' | 'weather' | 'custom-api';
export type TimelineOrientation = 'horizontal' | 'vertical';
export type GridLineIntensity = 'subtle' | 'medium' | 'vivid';
export type ThemeMode = 'system' | 'dark' | 'light';
export type RadarZoomLevel = 'local' | 'close' | 'standard' | 'wide';
export type RadarWidgetSize = 'standard' | 'compact';
export type WeatherLocationMode = 'manual' | 'auto';

export interface SwimlaneColorScheme {
  primary: string;    // Accent color (e.g. "#38bdf8", "#3b82f6")
  secondary: string;  // Subtle fill background (e.g. "rgba(56, 189, 248, 0.16)")
  accent: string;     // Border highlight / glow
  text: string;       // High contrast text
}

export interface SwimlaneConfig {
  id: string;
  title: string;
  enabled: boolean;
  colorScheme: SwimlaneColorScheme;
  icon: string;       // Lucide icon name (e.g. 'User', 'Heart', 'Briefcase', 'CloudSun')
  type: SwimlaneType;
  source: {
    endpoint: string; // Calendar iCal URL or API param
    refreshIntervalMinutes?: number;
    weatherProviderId?: string; // 'open-meteo' | 'fmi'
    weatherLocation?: string;   // Display location name (e.g. 'Helsinki')
    weatherLatitude?: number;   // Resolved latitude from geocoding
    weatherLongitude?: number;  // Resolved longitude from geocoding
    weatherLocationMode?: WeatherLocationMode; // 'manual' (hand-picked) or 'auto' (automatically detected)
    manualLocation?: {
      name: string;
      latitude: number;
      longitude: number;
    };
    autoLocation?: {
      name: string;
      latitude: number;
      longitude: number;
      method?: 'gps' | 'ip';
    };
    showRainAlerts?: boolean;   // Show proximity rain/snow approaching alert (default: true)
  };
}

export interface DashboardConfig {
  theme?: ThemeMode;
  orientation: TimelineOrientation;
  mutePastEvents: boolean;
  clock24h: boolean;
  idleResetMinutes: number;
  kioskMode?: boolean;
  zebraStriping: boolean;
  gridLineIntensity: GridLineIntensity;
  nightMode: {
    enabled: boolean;
    startHour: number; // e.g. 21
    endHour: number;   // e.g. 7
    dimAfterLastEvent?: boolean;
    dimAfterLastEventGraceSeconds?: number;
    dimAfterLastEventGraceMinutes?: number;
    backgroundDim?: number; // 40–95%, default 80
    cardDim?: number;       // 20–100%, default 70
    auroraAlerts?: boolean; // Show glowing Northern Lights indicator when active
  };
  // The live weather map. It always draws on the dark basemap.
  weatherMap: {
    showOnTimeline: boolean;  // Floating map in the corner of the timeline (default: true)
    showOnAmbient: boolean;   // Map card on the ambient screen (default: true)
    size: RadarWidgetSize;    // 'standard' (default) or 'compact', on both screens
    showAirplanes: boolean;   // Live ADS-B aircraft over the map (default: true)
    // Set with the map's own controls and remembered here; not shown in settings.
    zoom: RadarZoomLevel;                          // Home zoom preset (default: 'close')
    filterMode: 'rain' | 'clouds';                 // Rain only, or all clouds (default: 'clouds')
    renderMode: 'realistic-clouds' | 'radar-blocks'; // WebGL clouds or Doppler heatmap (default: 'realistic-clouds')
  };
  swimlanes: SwimlaneConfig[];
  welcomeSeen?: boolean;
}
```

### 5.2. Pluggable Weather Provider Architecture

Weather fetching is abstracted behind the `WeatherProvider` interface:

```typescript
export type WeatherSymbol =
  | 'clear-day'
  | 'clear-night'
  | 'partly-cloudy-day'
  | 'partly-cloudy-night'
  | 'cloudy'
  | 'fog'
  | 'rain-light'
  | 'rain-moderate'
  | 'rain-heavy'
  | 'sleet'
  | 'snow-light'
  | 'snow-heavy'
  | 'thunder';

export interface HourlyWeatherPoint {
  time: string;                     // ISO 8601 string
  temperature: number;              // °C
  symbol: WeatherSymbol;            // Normalized symbol
  precipitationMm: number;          // mm
  precipitationProbability?: number;// 0–100%
  windSpeedMs?: number;             // m/s sustained
  windGustMs?: number;              // m/s peak gusts
  windDirectionDeg?: number;        // meteorological wind direction (0-360°)
  isStormWarning?: boolean;         // True if speed or gusts >= 14 m/s
  description?: string;
  isDay?: boolean;                  // True if daylight hours
  sunrise?: string;                 // ISO 8601 string
  sunset?: string;                  // ISO 8601 string
}

export interface WindData {
  speedMs: number;
  gustMs?: number;
  directionDeg?: number;
  isStormWarning?: boolean;
}

export interface RainProximityAlert {
  status: 'active' | 'approaching';
  type: 'rain' | 'snow' | 'sleet';
  intensityMmH: number;
  summary: string;
  distanceKm?: number;
  updatedAt: string;
}

export interface WeatherProvider {
  id: string;
  name: string;
  description: string;
  defaultConfig: Record<string, any>;
  fetchForecast(date: Date, config: Record<string, any>): Promise<HourlyWeatherPoint[]>;
}
```

#### Supported Weather Providers:
1. **Open-Meteo Global Provider (`open-meteo` - Default):**
   - Free worldwide hourly forecasts without requiring an API key.
   - Includes Open-Meteo Geocoding API integration via `PlaceAutocomplete` for fast city search.
   - Ships with a deterministic weekly rotating demo city (`pickDemoCity()`) for instant first-run weather without manual configuration.
2. **Ilmatieteenlaitos / FMI Open Data Provider (`fmi`):**
   - Direct WFS XML queries against Finnish Meteorological Institute open data (`opendata.fmi.fi`).
   - Parses `Temperature`, `WeatherSymbol3`, `Precipitation1h`, and wind metrics.
3. **Glanceable Weather Visuals:**
   - 30-minute precipitation bars with precipitation probability percentages.
   - Storm / high wind alert badges (flagging gusts ≥ 14 m/s).

### 5.3. Calendar Parsing & Google Calendar Integration
- **RFC 5545 Conformance:** The custom parser unfolds long lines, unescapes characters, strips HTML formatting, and supports both timed and all-day events.
- **Recurrence Engine:** Expands standard `RRULE` patterns (e.g. `FREQ=WEEKLY;BYDAY=TU,TH`), respects `EXDATE` cancellations, and applies `RECURRENCE-ID` specific instance overrides.
- **Google Calendar Direct Web Links:** Automatically synthesizes direct Google Calendar URLs so users can click an event card or modal to view/edit the event directly in Google Calendar.

### 5.4. Astronomical Solar Engine & Day/Night Transitions
- **NOAA Solar Calculation (`packages/weather/src/solar.ts`):** High-precision astronomical algorithm calculates local sunrise, sunset, and daylight state from latitude, longitude, and UTC epoch timestamps, eliminating timezone-skew artifacts.
- **Dynamic Icon Sun/Moon Normalization:** Automatically swaps sun icons (`clear-day`, `partly-cloudy-day`) for moon icons (`clear-night`, `partly-cloudy-night`) for all hours occurring after local sunset.

### 5.5. Forecast Engine & Precipitation Timeline
- **Window-Aware Daypart Sampling:** Morning (06:00–12:00), Afternoon (12:00–18:00), and Evening (18:00–24:00) dayparts evaluate the full time window rather than an arbitrary single snapshot hour. If rain falls during commute or school hours, the daypart highlights the peak rain event.
- **Daytime-Weighted Dominant Weather:** Daily headline weather conditions prioritize active daytime hours (07:00–21:00). An isolated overnight rain spike (e.g. 05:00) does not label an otherwise dry day as "Heavy Rain".
- **24-Hour Precipitation Timeline:** Renders a glanceable hourly histogram bar chart with intensity color coding, a floating peak badge (e.g. `2.2mm`), and a values-first summary without verbose padding phrases.
- **Symmetrical Card Layout:** If *either* card has rain, both cards display their rain timeline (the rainless card shows a subtle flat baseline with `Dry through midnight` / `Dry throughout the day`); if *both* cards are dry, the timeline is hidden on both cards.
- **Continuous 3-Minute Auto-Refresh:** Polled every 3 minutes silently in the background with `{ cache: 'no-cache' }`, revalidating immediately when the window regains focus.

### 5.6. Space Weather Engine & Aurora Borealis Alerts
- **Decoupled Architecture (`packages/weather`):** Pure aurora evaluation is separate from NOAA Space Weather Prediction Center (SWPC) transport. The shared query entrypoint owns the 3-day planetary $K_p$ forecast cache and refresh cadence through TanStack Query.
- **Latitude-Scaled Thresholds:** Automatically adjusts minimum $K_p$ threshold based on configured station latitude:
  - Lapland / High Arctic ($\ge 66^\circ\text{N}$): $K_p \ge 2.5$
  - Central / Northern Finland ($\ge 63^\circ\text{N}$): $K_p \ge 3.5$
  - Southern Finland / Baltics ($\ge 60^\circ\text{N}$): $K_p \ge 4.5$
  - Central Europe / Lower Latitudes ($< 60^\circ\text{N}$): $K_p \ge 5.0\text{–}6.5+$
- **Tri-Factor Viewing Verification:** Aurora alerts only illuminate when all three environmental criteria align simultaneously:
  1. Astronomical night (`!isDaylight(time, lat, lon)`),
  2. Clear or partly cloudy night sky (`clear-night`, `partly-cloudy-night`) with zero precipitation,
  3. Forecast $K_p \ge \text{threshold}$.
- **Ambient Display Shimmer:** When active, cards display a breathing multi-hue Northern Lights glowing border (`aurora-card-border` in emerald, cyan, and violet), a compact `✨ Aurora · Kp X.X` header badge, and highlight specific upcoming hours and dayparts.

### 5.7. Live Weather Radar & Nowcasting Engine
- **FMI Doppler Radar Integration:** The radar library keeps projection and scene math provider-independent, while its explicit source adapter constructs FMI WMS requests and parses telemetry. Dashboard composition decides when FMI coverage is eligible and points aircraft fetching at its own `/api/adsb-proxy` relay (on by default within FMI coverage).
- **Where the code lives:** the radar components below belong to the radar library in `packages/radar`; `AmbientRadarCard.tsx` and `WeatherRadarOverlay.tsx` are the dashboard's compositions of them.
- **Unified Presentation Layer (`RadarViewport.tsx`):**
  - Powers both the timeline overlay widget (`LiveRadarMap.tsx`) and the ambient lockscreen card (`AmbientRadarCard.tsx`).
  - Procedural WebGL cloud shader (`CloudRadarCanvas.tsx`) with dual-layer fractional noise and tuned lighting for a natural fluffy cloud look, or classic Doppler color-stepped heatmap blocks (`radar-blocks`).
  - Slippy map on MapLibre GL JS (key-free Esri dark canvas and OpenStreetMap raster tiles): wheel/pinch zoom at the pointer, drag with inertia, a Recenter control, and the zoom preset as the home view. `RadarBasemapCanvas.tsx` remains as a fixed-view fallback without WebGL.
  - **Seamless zoom:** one frame clock, driven by the map's render event, draws every layer in the same frame as the basemap. Radar frames cover the whole FMI area once per scan and are sampled by ground position; procedural cloud detail uses zoom-continuous world noise, so clouds never slide, pop, or reload while zooming.
  - Zoom levels: `local` (±10 km neighborhood), `close` (±20 km default), `standard` (±35 km regional), `wide` (±70 km overview).
  - **Overlay layers:** Live aircraft positions (`AirplaneCanvas.tsx`) via ADS-B feed, thunderstorm lightning strikes (`LightningRadarCanvas.tsx`), and aurora borealis shimmer (`AuroraRadarCanvas.tsx`).
  - **Playback controls (`RadarPlaybackToolbar.tsx`):** Frame-by-frame radar animation playback with configurable speed.
- **Telemetry & Nowcasting Telemetry (`RadarWindBadge.tsx`):**
  - Real-time wind speed, gusts, and 16-point cardinal direction from Open-Meteo current endpoint (`fetchCurrentWind`).
  - Beaufort wind scale mapping, gale/storm warning flags (≥ 14 m/s), and rotating airflow vector indicating exact wind travel.
  - Real-time rain rate calculation and proximity detection (`fetchProximityRainAlert`, `useRadarRainRate`).
- **Winter Precipitation Adaptation:**
  - When temperatures are sub-zero ($< 0^\circ\text{C}$), rain alerts and radar telemetry automatically adapt to classify and report precipitation as snow or sleet (`snow-light`, `snow-heavy`, `sleet`), elevating dominant weather symbols to snow during winter conditions.

---

## 6. Visual Design Language & Aesthetics

- **Dual Themes (Dark & Light):**
  - **Dark Mode:** Deep obsidian (`#090d16` / `#0f1623`), subtle glass borders (`border-white/10`), and neon-accented playhead.
  - **Light Mode:** Crisp slate background (`bg-slate-50`), soft container fills (`bg-white`), dark slate typography, and tuned contrast borders.
  - **Theme Flash Prevention:** Synchronous inline script in `index.html` inspects `family_dashboard_config_v1` in `localStorage` prior to DOM paint.
- **High-Contrast Event Cards:** Tailored contrast borders, backdrop blurs, and distinct colors per lane for effortless readability across the room.
- **Ambient Night Mode & Lock Screen:**
  - Replaces generic idling with an ultra-glanceable screen: a large semibold wall clock (`font-semibold`, tabular numbers) with a proportionally dimmer date (`text-white/40`), centered above dual weather forecast cards (**Tonight / Rest of Today** and **Tomorrow**), an optional **week ahead** row of compact day cards, and an optional ambient **Live Radar Card** (`AmbientRadarCard.tsx`).
  - Triggers during configured night hours (default 21:00–07:00) or automatically when all scheduled events for the day have finished (`dimAfterLastEvent`).
  - Independent customizable sliders in Settings: **Background Dimness** (`backgroundDim`: 40–95%, default 80%) and **Cards & Clock Visibility** (`cardDim`: 20–100%, default 70%).
  - **Cursor Suppression:** Hides mouse pointers across the entire overlay (`cursor-none [&_*]:cursor-none`) to preserve a clean, distraction-free wall kiosk appliance aesthetic.
  - **Card Readiness Gating & Fade Transitions:** Guards ambient mounting (`shouldMountDimmer`) to ensure cards do not flash before weather and radar data are prepared. Smooth hardware-accelerated CSS keyframe animations (`animate-dimmer-fade-in`, `animate-dimmer-fade-out`) handle mounting and exit transitions.
  - **Wake Listener Gating & Anti-Flash Guards:** Wake listeners (`mousemove`, `keydown`, `touchstart`, `pointerdown`) are strictly attached only when the lock screen is actively eligible and displayed (`shouldListenForWake`). Wake handlers reject inputs when unmounted or during daytime (`shouldHandleWake`). When night mode concludes upon morning rollover (07:00), ambient eligibility flips to false, instantly tearing down wake listeners and pending timers so daytime mouse movement never causes a lock screen flash glitch.
  - Touch or mouse movement temporarily wakes the dashboard for 30 seconds.
  - **Entry Grace:** After loading, and whenever the lock screen becomes eligible again (night hours begin, the last event ends, or the user steps back to today from another day), it appears only after 30 seconds without input, so it never interrupts someone using the dashboard.

---

## 7. User Experience, Onboarding & Transparency

1. **First-Launch Onboarding (`WelcomeDialog`):**
   - Automatically welcomes first-time users.
   - Explains the demo mock schedule vs real Google Calendar iCal feeds.
   - Transparently explains CORS proxying, platform logging implications, and links directly to Self-Hosting and Privacy disclosures.
2. **In-App Privacy Transparency (`PrivacyModal`):**
   - Plain-language breakdown of client storage (`localStorage`), outbound requests, zero-telemetry policy, and how to wipe data.
3. **In-App Self-Hosting Guide (`SelfHostingModal`):**
   - Copy-paste ready Docker `docker run` and `docker-compose.yml` configurations.
   - Raspberry Pi kiosk auto-start instructions.
   - Local development instructions with Bun.
4. **Settings Drawer:**
   - Reorder lanes, toggle visibility, customize titles, swatches, and icons.
   - Location autocomplete search for weather coordinates with auto-detection vs manual override.
   - Full config JSON export, import, and factory reset.

---

## 8. Chrome OS Flex & Kiosk Deployment

To run as an appliance on wall-mounted hardware:
1. **PWA Standalone Mode:** Install via Chromium menu ("Install Meanwhile") to eliminate browser tabs and address bars.
2. **Kiosk Autostart:**
   ```bash
   chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:3000
   ```
3. **Display Longevity:**
   - Automatic night dimming.
   - Date transitions and live playhead movement keep pixels dynamic.

---

## 9. Verification & Testing Strategy

Automated tests run with **Bun's native test runner** (`bun test`, from the repository root) and
**Playwright** for browser suites. The dashboard's unit tests live in `tests/`; the libraries'
engine tests live in `packages/*/tests/`. Highlights:

1. **Timeline coordinate and grid maths** (`tests/features/timeline/`): 00:00–24:00 positioning, overnight clamping, split-progress muting, collision resolution, daylight saving days, and event time labels.
2. **iCal parser and recurrence** (`tests/ical-parser.test.ts`, `tests/local-calendar.test.ts`): RFC 5545 unfolding and unescaping, `RRULE` expansion, `EXDATE`, `RECURRENCE-ID` overrides, and local `.ics` import.
3. **Weather providers and composition** (`tests/weather-adapters.test.ts`, `tests/weather-composition.test.ts`; `packages/weather/tests/`): FMI WFS parsing, WMO code mapping, storm thresholds, daytime-weighted dominant conditions, freezing precipitation, dayparts, and the week outlook.
4. **Radar and nowcast** (`tests/weather-radar.test.ts`, `tests/radar-corner.test.ts`; `packages/radar/tests/`): Web Mercator projection, frame sources, playback and the timeline, the nowcast and steering winds, aircraft motion, lightning, and cloud lighting.
5. **Aurora and solar astronomy** (`packages/weather/tests/aurora.test.ts`, `daylight.test.ts`, `celestial.test.ts`): Kp thresholds by latitude, visibility, and NOAA solar maths.
6. **Night screen lifecycle** (`tests/ambient-policy.test.ts`, `tests/midnight-rollover.test.ts`): readiness, wake policy, and rollover guards.
7. **Settings and persistence** (`tests/features/settings/`): configuration storage, location modes, and Lanes.
8. **Relays** (`tests/calendar-proxy.test.ts`, `tests/proxy-security.test.ts`, `tests/aircraft-relay-contract.test.ts`): target validation and redirects, the calendar proxy's responses, self-hosted static files, and the radar-to-relay wire contract.
9. **Dependency hygiene** (`tests/dependency-hygiene.test.ts`): one React Query instance, app-local settings and wake policy, and a Docker build that copies every workspace manifest and needs no token.
10. **Browser suites** (`e2e/`): the functional suite against the production build on every pull request, and the night-screen controller nightly.

---

## 10. Implementation Status & Milestones

- [x] **Phase 1: Foundation & Timeline Math** (Bun, React, TypeScript, Tailwind CSS, core test suite).
- [x] **Phase 2: Timeline Engine & Day Navigation** (horizontal and vertical views, live playhead, split muting, idle return timer, animated day transitions).
- [x] **Phase 3: Data Connectors & Pluggable Weather** (RFC 5545 parser, recurrence, FMI and Open-Meteo adapters, geocoding search, weekly demo city rotation).
- [x] **Phase 4: Design Polish & Themes** (dark, light, and system themes with an anti-flash script, event detail modals, tooltips, zebra striping, grid intensity).
- [x] **Phase 5: Productization, Self-Hosting & Privacy** (multi-arch Docker image, dependency-free self-hosted server, Vercel edge relays, Welcome dialog, Privacy modal, self-hosting guide).
- [x] **Phase 6: Weather Radar, Space Weather & Night Screen** (FMI precipitation radar, Web Mercator projections, procedural WebGL clouds, the unified `RadarViewport`, wind telemetry, aurora alerts, cursor suppression on the night screen).
- [x] **Phase 7: Reusable Libraries & Example Apps** (weather, radar, ambient, UI, and relay libraries behind explicit entry points, in `packages/`; the weather-map and weather-clock example apps beside the dashboard in `apps/`).
