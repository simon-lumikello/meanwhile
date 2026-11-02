/**
 * Captures the README screenshots into `docs/screenshots/` from local production builds.
 *
 *   bun run screenshots              build everything, then capture every shot
 *   bun run screenshots --skip-build reuse the existing builds
 *   bun run screenshots dashboard-day weather-map   only the named shots
 *
 * The calendars are a made-up family served in place of the calendar relay; weather, radar,
 * aircraft, and map tiles are live, so run it in daylight when there are clouds over Espoo.
 * The night screen shows the real forecast for tonight, with aurora alerts off. Look at every
 * image before committing it.
 */
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'

const ROOT = resolve(import.meta.dir, '..')
const OUT_DIR = join(ROOT, 'docs', 'screenshots')
const TIME_ZONE = 'Europe/Helsinki'
const VIEWPORT = { width: 1600, height: 900 }
const LOCATION = { name: 'Espoo', latitude: 60.2055, longitude: 24.6559 }

interface Server { url: string; stop: () => void }

interface Target { dir: string; build: string[]; preview: string[]; port: number }

const TARGETS = {
  dashboard: { dir: 'apps/dashboard', build: ['vite', 'build'], preview: ['vite', 'preview'], port: 3110 },
  weatherMap: { dir: 'apps/weather-map', build: ['vite', 'build'], preview: ['vite', 'preview'], port: 3112 },
  weatherClock: { dir: 'apps/weather-clock', build: ['vite', 'build'], preview: ['vite', 'preview'], port: 3111 },
} satisfies Record<string, Target>

type TargetName = keyof typeof TARGETS

async function build(target: Target) {
  const proc = Bun.spawn(['bun', ...target.build], { cwd: join(ROOT, target.dir), stdout: 'inherit', stderr: 'inherit' })
  if (await proc.exited !== 0) throw new Error(`Build failed in ${target.dir}`)
}

async function startServer(target: Target): Promise<Server> {
  const url = `http://127.0.0.1:${target.port}`
  const proc = Bun.spawn(['bun', ...target.preview, '--host', '127.0.0.1', '--port', String(target.port), '--strictPort'], { cwd: join(ROOT, target.dir), stdout: 'ignore', stderr: 'inherit' })
  // `bun vite` runs vite in a child process, which outlives a plain kill on Windows.
  const stop = () => process.platform === 'win32' ? Bun.spawnSync(['taskkill', '/F', '/T', '/PID', String(proc.pid)], { stdout: 'ignore', stderr: 'ignore' }) : proc.kill()
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) return { url, stop }
    } catch { /* not listening yet */ }
    await Bun.sleep(500)
  }
  stop()
  throw new Error(`${target.dir} preview did not start on ${url}`)
}

// --- Helsinki wall-clock times -------------------------------------------------------------

function helsinkiDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

function helsinkiHour(at: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(at))
}

function offsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' }).formatToParts(at).find(part => part.type === 'timeZoneName')?.value ?? ''
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0
}

/** The instant of a Helsinki wall-clock time on the given `YYYY-MM-DD` day. */
function wallTime(day: string, hour: number, minute = 0): Date {
  const asUtc = new Date(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)
  return new Date(asUtc.getTime() - offsetMinutes(asUtc) * 60_000)
}

const NOW = new Date()
const TODAY = helsinkiDay(NOW)
// The day view reads best in the afternoon; outside it, pin the clock to 14:10 today.
const DAY_TIME = helsinkiHour(NOW) >= 10 && helsinkiHour(NOW) < 18 ? NOW : wallTime(TODAY, 14, 10)
const NIGHT_TIME = wallTime(TODAY, 21, 40)

// --- The made-up family --------------------------------------------------------------------

type Event = [start: string, end: string, summary: string]

const FAMILY: { id: string; title: string; icon: string; color: number; events: Event[] }[] = [
  // Half-hour events show their title on one line; give longer ones at least an hour.
  { id: 'mum', title: 'Mum', icon: 'Briefcase', color: 2, events: [['08:30', '09:00', 'Team stand-up'], ['10:00', '11:30', 'Project review'], ['15:00', '16:00', 'Dentist'], ['18:30', '19:00', 'Pick up Eero from football']] },
  { id: 'dad', title: 'Dad', icon: 'User', color: 1, events: [['09:00', '12:00', 'Client workshop'], ['13:00', '14:00', 'Budget meeting'], ['16:30', '17:00', 'Grocery run'], ['19:30', '20:30', 'Floorball']] },
  { id: 'aino', title: 'Aino', icon: 'Music', color: 5, events: [['08:15', '13:45', 'School'], ['14:30', '15:30', 'Piano lesson'], ['16:00', '17:00', 'Swimming']] },
  { id: 'eero', title: 'Eero', icon: 'Dumbbell', color: 4, events: [['08:15', '12:15', 'School'], ['12:15', '16:00', 'Afternoon club'], ['17:00', '18:30', 'Football practice']] },
]

const PRESET_COLORS = [
  { primary: '#38bdf8', secondary: 'rgba(56, 189, 248, 0.16)', accent: '#7dd3fc', text: '#ffffff' },
  { primary: '#3b82f6', secondary: 'rgba(59, 130, 246, 0.16)', accent: '#60a5fa', text: '#ffffff' },
  { primary: '#ec4899', secondary: 'rgba(236, 72, 153, 0.16)', accent: '#f472b6', text: '#ffffff' },
  { primary: '#10b981', secondary: 'rgba(16, 185, 129, 0.16)', accent: '#34d399', text: '#ffffff' },
  { primary: '#f59e0b', secondary: 'rgba(245, 158, 11, 0.16)', accent: '#fbbf24', text: '#ffffff' },
  { primary: '#8b5cf6', secondary: 'rgba(139, 92, 246, 0.16)', accent: '#a78bfa', text: '#ffffff' },
]

const calendarUrl = (id: string) => `https://calendar.example/${id}.ics`

function icsFor(id: string): string {
  const member = FAMILY.find(entry => calendarUrl(entry.id) === id)
  const compact = (time: string) => `${TODAY.replaceAll('-', '')}T${time.replace(':', '')}00`
  const events = (member?.events ?? []).flatMap(([start, end, summary], index) => [
    'BEGIN:VEVENT', `UID:${member?.id}-${index}@meanwhile.example`, `DTSTART:${compact(start)}`, `DTEND:${compact(end)}`, `SUMMARY:${summary}`, 'END:VEVENT',
  ])
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//meanwhile//screenshots//EN', ...events, 'END:VCALENDAR'].join('\r\n')
}

function dashboardConfig(overrides: { orientation?: 'horizontal' | 'vertical'; nightMode?: object; weatherMap?: object } = {}) {
  return {
    theme: 'dark',
    welcomeSeen: true,
    clock24h: true,
    kioskMode: false,
    orientation: overrides.orientation ?? 'horizontal',
    mutePastEvents: false,
    nightMode: { enabled: false, startHour: 21, endHour: 7, dimAfterLastEvent: false, backgroundDim: 80, cardDim: 70, auroraAlerts: true, ...overrides.nightMode },
    weatherMap: { showOnTimeline: true, showOnAmbient: false, size: 'standard', showAirplanes: true, zoom: 'close', filterMode: 'clouds', renderMode: 'realistic-clouds', cloudTransparency: 'solid', cloudLighting: 'time-of-day', ...overrides.weatherMap },
    swimlanes: [
      {
        id: 'lane-weather', title: 'Weather', enabled: true, type: 'weather', icon: 'CloudSun', colorScheme: PRESET_COLORS[0],
        source: { endpoint: '', weatherProviderId: 'fmi', weatherLocation: LOCATION.name, weatherLatitude: LOCATION.latitude, weatherLongitude: LOCATION.longitude, weatherLocationMode: 'manual', manualLocation: LOCATION, refreshIntervalMinutes: 15, showRainAlerts: true },
      },
      ...FAMILY.map(member => ({
        id: `lane-${member.id}`, title: member.title, enabled: true, type: 'google-calendar', icon: member.icon, colorScheme: PRESET_COLORS[member.color],
        source: { endpoint: calendarUrl(member.id), calendarSource: 'url' },
      })),
    ],
  }
}

async function openDashboard(context: BrowserContext, server: Server, at: Date, config: object): Promise<Page> {
  const page = await context.newPage()
  await page.clock.setFixedTime(at)
  await page.route('**/api/ical-proxy**', route => route.fulfill({ contentType: 'text/calendar', body: icsFor(new URL(route.request().url()).searchParams.get('url') ?? '') }))
  await page.addInitScript(stored => window.localStorage.setItem('family_dashboard_config_v1', JSON.stringify(stored)), config)
  await page.goto(server.url)
  await page.getByRole('heading', { name: 'Football practice' }).first().waitFor()
  return page
}

// --- Shots ---------------------------------------------------------------------------------

type Shot = (browser: Browser, servers: Record<TargetName, Server | undefined>) => Promise<void>

const MAX_BYTES = 600_000
const REDUCED_WIDTH = 1280

/**
 * Screenshots the page (or a clip of it). A large image, like a cloudy radar, is scaled down to
 * 1280 pixels wide: a 256-colour palette bands the clouds and the dark gradients.
 */
async function save(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) {
  const shot = await page.screenshot({ clip })
  const width = clip?.width ?? page.viewportSize()?.width ?? VIEWPORT.width
  const bytes = shot.length > MAX_BYTES && width > REDUCED_WIDTH ? await new Bun.Image(shot).resize(REDUCED_WIDTH).png({ compressionLevel: 9 }).bytes() : shot
  await Bun.write(join(OUT_DIR, `${name}.png`), bytes)
  console.log(`  ${name}.png: ${Math.round(bytes.length / 1024)} KB`)
}

async function newContext(browser: Browser, viewport = VIEWPORT) {
  return browser.newContext({ viewport, deviceScaleFactor: 1, timezoneId: TIME_ZONE, locale: 'en-GB', colorScheme: 'dark' })
}

async function settle(page: Page, ms = 8_000) {
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined)
  await page.waitForTimeout(ms)
}

/** Opens an example app or library fixture with a stored config, in its own context. */
async function openPage(browser: Browser, url: string, storage?: { key: string; value: object }): Promise<{ context: BrowserContext; page: Page }> {
  const context = await newContext(browser)
  const page = await context.newPage()
  if (storage) await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)), storage)
  await page.goto(url)
  return { context, page }
}

const RADAR_CONFIG = { latitude: LOCATION.latitude, longitude: LOCATION.longitude, location: LOCATION.name, zoom: 'close', showBasemap: true, showAirplanes: true, filterMode: 'clouds', renderMode: 'realistic-clouds', cloudTransparency: 'solid', cloudLighting: 'time-of-day', mapStyle: 'dark-canvas' }

const SHOTS: Record<string, { needs: TargetName; run: Shot }> = {
  'dashboard-day': {
    needs: 'dashboard',
    run: async (browser, servers) => {
      // Vertical lanes, a wall display's height: an hour-long event then has room for its title.
      // The radar has its own shot.
      const context = await newContext(browser, { width: VIEWPORT.width, height: 1200 })
      const page = await openDashboard(context, servers.dashboard!, DAY_TIME, dashboardConfig({ orientation: 'vertical', weatherMap: { showOnTimeline: false } }))
      await settle(page)
      await save(page, 'dashboard-day')
      await context.close()
    },
  },
  'dashboard-radar': {
    needs: 'dashboard',
    run: async (browser, servers) => {
      const context = await newContext(browser)
      // Zoomed out far enough to take in Helsinki Airport's traffic.
      const page = await openDashboard(context, servers.dashboard!, DAY_TIME, dashboardConfig({ weatherMap: { zoom: 'standard' } }))
      await page.getByRole('button', { name: 'Maximize radar' }).click()
      await settle(page, 20_000)
      await save(page, 'dashboard-radar')
      await context.close()
    },
  },
  'dashboard-night': {
    needs: 'dashboard',
    run: async (browser, servers) => {
      const context = await newContext(browser)
      const config = dashboardConfig({ nightMode: { enabled: true, dimAfterLastEvent: true, auroraAlerts: false }, weatherMap: { showOnTimeline: false } })
      const page = await openDashboard(context, servers.dashboard!, NIGHT_TIME, config)
      // The night screen waits 30 seconds after loading before it takes over.
      await settle(page, 36_000)
      await save(page, 'dashboard-night')
      // The ambient library's part of it: the clock and the forecast cards.
      await save(page, 'ambient', { x: 270, y: 160, width: 1060, height: 700 })
      await context.close()
    },
  },
  weather: {
    needs: 'dashboard',
    run: async (browser, servers) => {
      const context = await newContext(browser)
      const page = await openDashboard(context, servers.dashboard!, DAY_TIME, dashboardConfig({ weatherMap: { showOnTimeline: false } }))
      await settle(page)
      // The header, the hour axis, and the weather lane.
      await save(page, 'weather', { x: 0, y: 0, width: VIEWPORT.width, height: 190 })
      await context.close()
    },
  },
  ui: {
    needs: 'dashboard',
    run: async (browser, servers) => {
      const context = await newContext(browser)
      const page = await openDashboard(context, servers.dashboard!, DAY_TIME, dashboardConfig({ orientation: 'vertical', weatherMap: { showOnTimeline: false } }))
      await page.locator('header').getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('dialog', { name: 'Dashboard Settings' }).waitFor()
      await settle(page, 2_000)
      await save(page, 'ui')
      await context.close()
    },
  },
  'weather-map': {
    needs: 'weatherMap',
    run: async (browser, servers) => {
      const { context, page } = await openPage(browser, servers.weatherMap!.url, { key: 'family_radar_config_v1', value: { ...RADAR_CONFIG, zoom: 'standard' } })
      await settle(page, 20_000)
      await save(page, 'weather-map')
      await context.close()
    },
  },
  radar: {
    needs: 'weatherMap',
    run: async (browser, servers) => {
      // The cloud renderer closer in: the middle of the map, without the app's badges.
      const { context, page } = await openPage(browser, servers.weatherMap!.url, { key: 'family_radar_config_v1', value: RADAR_CONFIG })
      await settle(page, 20_000)
      await save(page, 'radar', { x: 160, y: 90, width: REDUCED_WIDTH, height: 720 })
      await context.close()
    },
  },
  'weather-clock': {
    needs: 'weatherClock',
    run: async (browser, servers) => {
      const value = { latitude: LOCATION.latitude, longitude: LOCATION.longitude, location: LOCATION.name, clock24h: true, brightness: 80, showRadar: true, radarZoom: 'close', showBasemap: true, mapStyle: 'dark-canvas', filterMode: 'clouds', renderMode: 'realistic-clouds', showWeek: true }
      const { context, page } = await openPage(browser, servers.weatherClock!.url, { key: 'family_ambient_config_v1', value })
      await settle(page, 15_000)
      await save(page, 'weather-clock')
      await context.close()
    },
  },
}

async function main() {
  const args = process.argv.slice(2)
  const skipBuild = args.includes('--skip-build')
  const names = args.filter(arg => !arg.startsWith('--'))
  const selected = names.length ? names : Object.keys(SHOTS)
  const unknown = selected.filter(name => !SHOTS[name])
  if (unknown.length) throw new Error(`Unknown shot(s): ${unknown.join(', ')}. Known: ${Object.keys(SHOTS).join(', ')}`)

  const needed = [...new Set(selected.map(name => SHOTS[name].needs))]
  if (!skipBuild) for (const name of needed) await build(TARGETS[name])

  mkdirSync(OUT_DIR, { recursive: true })
  const servers: Record<TargetName, Server | undefined> = { dashboard: undefined, weatherMap: undefined, weatherClock: undefined }
  const browser = await chromium.launch()
  try {
    for (const name of needed) servers[name] = await startServer(TARGETS[name])
    for (const name of selected) {
      console.log(`Capturing ${name}`)
      await SHOTS[name].run(browser, servers)
    }
  } finally {
    await browser.close()
    for (const server of Object.values(servers)) server?.stop()
  }
}

await main()
