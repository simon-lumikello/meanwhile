# Self-Hosting Guide

**On-device alternative on the public app:** choose **Settings → Lanes → Calendar source → Local .ics file**, select an exported calendar, and press **Apply**. Calendar contents stay in your browser and never pass through a relay. Re-import to update events. Self-hosting remains an option for automatic calendar URL sync with a relay you control.


This guide explains how to run Meanwhile — including its iCal proxy — entirely on infrastructure you control, so you don't have to trust anyone else with your calendar data.

---

## Why self-host?

Google Calendar's secret iCal links are permanent credentials. Anyone who has the URL can read your calendar indefinitely.

The hosted app routes these URLs through a relay server to work around browser CORS restrictions. That relay is operated by us. **Self-hosting means the relay is operated by you** — your calendar URLs never leave your own machine or account.

---

## Option A — Docker (recommended for home servers & Raspberry Pi)

Docker is a single installer that runs anywhere: Linux, macOS, Windows, Raspberry Pi.

**→ [Get Docker](https://docs.docker.com/get-docker/)**

### Quickstart — one command

```bash
docker run -d \
  --name meanwhile \
  --restart unless-stopped \
  -p 3000:3000 \
  ghcr.io/simon-lumikello/meanwhile:latest
```

Open `http://localhost:3000` in your browser. Done.

### docker-compose (recommended for keeping it running)

Create a `docker-compose.yml` anywhere on your machine:

```yaml
services:
  meanwhile:
    image: ghcr.io/simon-lumikello/meanwhile:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
```

Then:

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Update to latest version
docker compose pull && docker compose up -d
```

`latest` is the newest [release](https://github.com/simon-lumikello/meanwhile/releases), not every
change: images are published only when a release is made, each with its notes. To stay on one release
until you choose to move, use its version tag instead, e.g. `ghcr.io/simon-lumikello/meanwhile:1.2.0`
(or `:1.2` to follow its fixes).

### Raspberry Pi

The image is built for both `amd64` and `arm64` — no extra steps needed. The `docker run` command above works unchanged on a Raspberry Pi 4 or 5.

For a permanent wall display: set the Pi to auto-login, open Chromium in kiosk mode pointing at `http://localhost:3000`, and the dashboard runs fully offline.

```bash
# Chromium kiosk mode (add to /etc/xdg/autostart or ~/.config/autostart)
chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:3000
```

---

## Option B — One-click deploy to your own Vercel account

If you'd prefer a cloud deployment you control (no server to maintain), fork the repo into your own Vercel account:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsimon-lumikello%2Fmeanwhile&project-name=meanwhile)

When Vercel asks for the project settings, set **Root Directory** to `apps/dashboard`; its
`vercel.json` supplies the rest. The build compiles the `@simon-lumikello/meanwhile-*` libraries from the repository's `packages/`
folder, so it needs no environment variables or tokens.

Your iCal URLs appear only in **your** Vercel access logs, not ours.

To verify the deployed code matches the source:
1. Open your Vercel project → **Deployments** tab
2. Each deployment shows a git commit SHA
3. Match it against the commit on your GitHub fork

---

## Option C — Local dev server (maximum privacy, no Docker)

If the app runs on the same machine as your browser, the Vite dev server's built-in proxy handles iCal requests entirely locally — nothing leaves your machine.

The `@simon-lumikello/meanwhile-*` libraries (weather, radar, ambient, UI, relay) are part of the
repository, in `packages/`, so a plain install is all it takes.

```bash
# Prerequisites: Bun
git clone https://github.com/simon-lumikello/meanwhile.git
cd meanwhile

bun install
bun run dev
```

Open `http://localhost:5173`. The iCal proxy runs locally.

---

## Verifying the Docker image matches the source

Images published to GHCR are tagged with their release version (e.g. `1.2.0`) and the git commit SHA (e.g. `sha-a3f9c12`). To verify:

1. Pull the image: `docker pull ghcr.io/simon-lumikello/meanwhile:latest`
2. Check its labels: `docker inspect ghcr.io/simon-lumikello/meanwhile:latest | grep sha`
3. Find that commit on GitHub and review the source

Or build it yourself from source, which guarantees you run exactly what you've read. The build
needs no secrets or tokens:

```bash
git clone https://github.com/simon-lumikello/meanwhile.git
cd meanwhile
docker build -t meanwhile .
docker run -d --restart unless-stopped -p 3000:3000 meanwhile
```

---

## What the relays do (and don't do)

The app runs two small relays, because browsers cannot fetch these feeds directly
(CORS). Each is one handler in `apps/dashboard/server/`, served by the self-hosted server
(Docker), by the Edge Functions in `api/` (Vercel), and by the Vite dev server.

**Calendar relay** — `/api/ical-proxy`:

| Does | Doesn't |
|---|---|
| Fetch your `.ics` feed from Google | Store your URL or calendar data |
| Return the feed to your browser | Log requests (unless you add logging) |
| Cache responses for ~3 minutes | Transmit data to any third party |
| Refuse non-HTTP(S), loopback, and private-network targets | Follow redirects to such targets |

**Aircraft relay** — `/api/adsb-proxy` (also answers the older `/api/opensky-proxy`):

| Does | Doesn't |
|---|---|
| Run two fixed searches covering Finland against [api.adsb.lol](https://api.adsb.lol) and keep only aircraft inside Finland's land territory and territorial waters | Send your location, or anything else about you or your calendar |
| Return that country-wide snapshot to your browser, which polls it every 30 seconds | Store or log requests (unless you add logging) |
| Cache the snapshot briefly (~25 seconds), shared by every viewer | Accept anything but a configured region name or numeric, in-range coordinates |

The browser never sends its location for aircraft, and zooming or panning the
radar makes no aircraft requests.

The self-hosted server's source is `apps/dashboard/server/`: `index.ts` (static files and
routing), `calendarProxy.ts` and `proxySecurity.ts` (the calendar relay and its URL checks),
`aircraftRelay.ts`, and the `@simon-lumikello/meanwhile-relay` library. The Docker image runs a single
bundled file with no runtime dependencies, produced by `bun run build:server`.

---

## Questions?

Open an issue on GitHub if anything in this guide is unclear or out of date.
