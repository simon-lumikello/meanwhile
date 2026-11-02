# Privacy Policy & Data Transparency

**Plain language. No legalese.**

Last updated: October 2026

---

## What this app is

Meanwhile is a static web application. It runs in your browser, with two small relay functions for data your browser cannot fetch directly (calendar feeds and live aircraft). There is no backend database, no user accounts, and no telemetry.

---

## What data exists and where it lives

### Your configuration (calendar sources, names, colours, preferences)

- Stored exclusively in your **browser's `localStorage`** under the key `family_dashboard_config_v1`
- Settings and imported .ics files stay on your device; calendar URLs are sent to the relay when URL sync is selected
- Never synced to any cloud
- Deleted when you clear browser storage or use Settings → Backup & Restore → Reset All

### Your calendar events

Choose a source in **Settings → Lanes → Calendar source**:

- **Local .ics file:** export an .ics file from your calendar app, select it, and press **Apply**. The browser reads and stores the calendar locally. No calendar URL or event data is uploaded or sent through the relay, even on the public app. The imported snapshot survives reloads; import a replacement to update it. Cancel discards pending changes. Removing the imported calendar or resetting settings and pressing Apply deletes the stored copy; the original file on your device is unchanged.
- **Calendar URL:** feeds are fetched through the relay and parsed in your browser. This enables automatic refresh and has the relay privacy implications described below.
- Configuration backups include imported calendar contents and secret calendar URLs. Keep backup files and copied JSON private. Clearing browser storage removes the saved import; retain your original .ics file or a private backup.

---

## The iCal proxy — full disclosure (Calendar URL sources only)

Google Calendar's secret iCal links cannot be fetched directly from a browser due to CORS (a browser security policy). The app works around this by routing iCal requests through a relay function hosted on Vercel.

### What the proxy receives

- Your secret iCal URL (in the request query string)
- Your IP address (standard HTTP request metadata)

### What the proxy does with it

1. Makes one HTTP request to Google's servers to fetch your `.ics` file
2. Returns the response body to your browser
3. **Does nothing else** — no logging of your URL, no storage, no analytics

### What we could do if we were malicious (we don't, but you should know)

- Read every event in your calendar
- Store your secret URL and use it to access your calendar indefinitely (the URL never expires)
- Correlate your IP address with your calendar contents

We are not malicious. But trust is not a substitute for verification.

### Vercel infrastructure logs

Vercel (our hosting provider) logs all inbound HTTP requests, including query parameters, as part of their standard platform behaviour. This means your iCal URL **appears in Vercel's access logs** for our project, for up to 30 days (Vercel's default retention). We cannot disable this on the current hosting plan.

[Vercel's privacy policy →](https://vercel.com/legal/privacy-policy)

### The honest recommendation

> **Use Local .ics file to keep your calendar on your device, including on the public app.** This bypasses the calendar relay entirely. For automatic calendar URL sync under your own control, self-host. Run our pre-built Docker container on your home server or Raspberry Pi (`ghcr.io/simon-lumikello/meanwhile:latest`), or deploy a copy to your own Vercel account. See [SELF_HOSTING.md](./SELF_HOSTING.md).

---

## Weather, radar & environmental requests

If you enable a weather lane, weather radar, or space weather alerts, the app fetches data directly from public open-data providers:

- [open-meteo.com](https://open-meteo.com) — open source, no API key required (hourly forecasts, wind telemetry & city geocoding search)
- [Finnish Meteorological Institute](https://www.ilmatieteenlaitos.fi/avoin-data) (FMI) — Finnish government open data (WFS weather observations and WMS Doppler precipitation radar imagery; while the radar timeline shows a forecast, MEPS model winds for a few points around your configured location)
- [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/) (SWPC) — US government open space weather data (planetary $K_p$ index forecasts for Northern Lights detection)

These requests are made **directly from your browser** — they do not go through our proxy. The only data sent is a latitude/longitude pair corresponding to your configured location, or the city search query when typing in the Settings location field. No personal identifiers are sent.

Radar images are requested for the whole FMI coverage area (all of Finland) and so carry no location. The map under the radar loads dark basemap tiles from [Esri](https://www.esri.com/) for the area currently on screen, as any web map does; tile requests contain only tile coordinates. None of these providers needs an API key.

---

## Live aircraft on the radar — the aircraft relay

When your configured location is inside FMI radar coverage, the radar shows live
aircraft positions by default. The ADS-B data provider,
[adsb.lol](https://adsb.lol) (a community ADS-B exchange), cannot be called
directly from a browser (CORS), so these requests go through a second relay,
`/api/adsb-proxy`, hosted alongside the calendar relay.

- **What it receives:** a request for all aircraft over Finland
  (`?region=finland`), every 30 seconds, and your IP address (standard HTTP
  metadata). The request carries no location: every visitor asks for the same
  country-wide snapshot, and zooming or panning the radar sends nothing.
- **What it sends onward:** two fixed searches that together cover Finland, to
  `api.adsb.lol`. Nothing about you, your location, your calendar, or your
  settings is included.
- **What it keeps:** nothing. The shared snapshot is cached for under a minute to
  limit load; no requests are stored or logged by the relay.
- **Hosting logs:** as with the calendar relay, Vercel's access logs record the
  request, but for aircraft it contains no location.

Self-hosting keeps these requests on your own infrastructure (see
[SELF_HOSTING.md](./SELF_HOSTING.md)).

---

## What we explicitly do not use

- ❌ Google Analytics, Plausible, Mixpanel, or any analytics platform
- ❌ Error tracking or crash reporting (Sentry, Bugsnag, etc.)
- ❌ Session recording or heatmap tools (Hotjar, FullStory, etc.)
- ❌ Advertising or retargeting pixels
- ❌ User accounts or authentication of any kind
- ❌ Server-side databases or persistent storage of user data (neither relay writes anything to storage)
- ❌ Cookies

---

## How to delete everything

Open Settings → Backup & Restore → **"Reset All to Defaults"**, then **Apply**.

Or manually: browser DevTools (F12) → Application → Local Storage → delete `family_dashboard_config_v1`.

After a page refresh, the app has no memory of you.

---

## Open source

The full source code — including both relays — is on GitHub; the shared weather, radar, and relay libraries are in the same repository, under `packages/`. You can read every line, verify what the proxy does, and fork it to run your own copy.

If you find a privacy issue or something in this document is inaccurate, please open a GitHub issue.
