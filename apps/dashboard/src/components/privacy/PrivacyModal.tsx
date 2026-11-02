import React from 'react'
import { Button, Dialog } from '@simon-lumikello/meanwhile-ui/react'
import { HardDrive, Wifi, ShieldCheck, Trash2, ExternalLink, Server, AlertTriangle } from 'lucide-react'

interface PrivacyModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenSelfHost?: () => void
  isDark: boolean
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose, onOpenSelfHost, isDark }) => {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      icon={<ShieldCheck size={20} className="text-emerald-400" />}
      title="Privacy Policy & Data Transparency"
      footer={
        <Button size="lg" variant="solid" tone="primary" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <div className="space-y-6 text-sm">

        {/* Zero collection headline */}
        <div className={`rounded-xl p-4 border ${isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className="font-semibold text-emerald-400">
            🔒 Meanwhile collects absolutely nothing about you.
          </p>
          <p className={`mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            There are no accounts, no analytics, no tracking pixels, no cookies, and no server-side database. Local .ics calendars stay in your browser; calendar URLs use the relay described below.
          </p>
        </div>

        {/* Section: Storage */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <HardDrive size={15} className={isDark ? 'text-sky-400' : 'text-sky-600'} />
            <h3 className="font-semibold">Where your settings are stored</h3>
          </div>
          <p className={isDark ? 'text-slate-300 leading-relaxed' : 'text-slate-600 leading-relaxed'}>
            All configuration — lane names, colors, calendar URLs, imported .ics files, display preferences — is saved
            exclusively in your browser's <code className="px-1 py-0.5 rounded text-xs font-mono bg-black/20">localStorage</code> under
            the key <code className="px-1 py-0.5 rounded text-xs font-mono bg-black/20">family_dashboard_config_v1</code>.
          </p>
          <p className={`mt-2 ${isDark ? 'text-slate-300 leading-relaxed' : 'text-slate-600 leading-relaxed'}`}>
            Imported .ics files stay on your device and are never uploaded. Settings are not synced to our servers. Calendar URLs are sent to the relay only when URL sync is selected. Configuration backups include imported calendar contents; keep them private.
          </p>
        </section>

        {/* Section: Network */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Wifi size={15} className={isDark ? 'text-violet-400' : 'text-violet-600'} />
            <h3 className="font-semibold">What network requests are made</h3>
          </div>
          <p className={`mb-3 ${isDark ? 'text-slate-300 leading-relaxed' : 'text-slate-600 leading-relaxed'}`}>
            The app makes <strong>three kinds of outbound requests</strong>: weather data straight from your browser, and calendar feeds and live aircraft through small relays.
          </p>
          <div className="space-y-3">
            <div className={`rounded-lg p-3 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
              <p className="font-medium mb-1">1 · Weather, radar &amp; space weather</p>
              <p className={isDark ? 'text-slate-400 leading-relaxed' : 'text-slate-500 leading-relaxed'}>
                For forecasts, radar, lightning, and city search, your browser calls either{' '}
                <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer"
                   className="text-sky-400 hover:underline inline-flex items-center gap-0.5">
                  open-meteo.com <ExternalLink size={11} />
                </a>{' '}
                or{' '}
                <a href="https://www.ilmatieteenlaitos.fi/avoin-data" target="_blank" rel="noopener noreferrer"
                   className="text-sky-400 hover:underline inline-flex items-center gap-0.5">
                  ilmatieteenlaitos.fi <ExternalLink size={11} />
                </a>{' '}
                directly, plus NOAA&apos;s Space Weather Prediction Center for aurora alerts. Only a
                latitude/longitude pair (or your city search text) is sent — no personal data.
                Radar images cover all of Finland, so they carry no location at all; the radar
                forecast asks FMI for model winds at a few points around your location. The map under
                the radar loads tiles for the area on screen from Esri.
                No API key required.
              </p>
            </div>
            <div className={`
              rounded-xl p-4 border-2 transition-all
              ${isDark
                ? 'bg-amber-500/10 border-amber-500/35 text-slate-200 shadow-lg shadow-amber-950/20'
                : 'bg-amber-50/90 border-amber-300 text-slate-800 shadow-sm'}
            `}>
              <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={17} className={isDark ? 'text-amber-400' : 'text-amber-600'} />
                  <h4 className={`font-bold text-sm ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                    2 · Calendar URLs and local .ics files
                  </h4>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                  isDark
                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                    : 'bg-amber-100 border-amber-300 text-amber-800'
                }`}>
                  Choose your source
                </span>
              </div>

              <div className={`p-2.5 rounded-lg mb-3 text-xs leading-relaxed border ${
                isDark
                  ? 'bg-amber-500/15 border-amber-500/25 text-amber-200'
                  : 'bg-amber-100/80 border-amber-300 text-amber-900'
              }`}>
                <strong>Keep your calendar on this device:</strong> In Settings → Lanes → Calendar source, choose Local .ics file. Export a calendar from your calendar app, select it here, and press Apply. The file is parsed and stored only in this browser, even on the public app. Import a replacement when events change; no calendar relay is used.
              </div>

              <p className={`mb-2.5 leading-relaxed text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Google Calendar iCal links cannot be fetched directly by your browser due to browser security restrictions (CORS policy). The app routes them through a lightweight relay function at{' '}
                <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-black/20">/api/ical-proxy</code>.
                The relay fetches your feed and returns it — it writes nothing to a database.
              </p>

              <div className={`p-3 rounded-lg border text-xs ${
                isDark
                  ? 'bg-black/30 border-amber-500/20 text-slate-300'
                  : 'bg-white/80 border-amber-200 text-slate-700'
              }`}>
                <p className={`font-semibold mb-1 flex items-center gap-1.5 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  <span>Full Disclosure & Platform Logs:</span>
                </p>
                <p className="leading-relaxed mb-2">
                  The relay temporarily processes your secret iCal URL and calendar data in memory while fulfilling your request.
                  Additionally, <strong>Vercel (our hosting provider) logs all incoming HTTP requests including query strings for up to 30 days</strong> as part of platform infrastructure access logs. Your secret iCal URL is in that query string, and we cannot disable this on the current hosting plan.
                </p>
                <p className="leading-relaxed">
                  For an on-device alternative, choose Local .ics file in Settings → Lanes. For automatic URL sync under your own control, you can{' '}
                  <button
                    type="button"
                    onClick={onOpenSelfHost}
                    className="text-indigo-400 hover:underline font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    self-host the proxy
                  </button>
                  {' '}— it takes ~5 minutes, is completely free, and guarantees your iCal URLs never touch third-party hosting logs.
                </p>
              </div>
            </div>
            <div className={`rounded-lg p-3 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
              <p className="font-medium mb-1">3 · Live aircraft on the radar</p>
              <p className={isDark ? 'text-slate-400 leading-relaxed' : 'text-slate-500 leading-relaxed'}>
                When your location is inside FMI radar coverage, the radar shows aircraft over Finland. The ADS-B feed
                cannot be reached from a browser directly, so a small relay at{' '}
                <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-black/20">/api/adsb-proxy</code>{' '}
                fetches one country-wide snapshot every 30 seconds, the same for every visitor, from{' '}
                <a href="https://adsb.lol" target="_blank" rel="noopener noreferrer"
                   className="text-sky-400 hover:underline inline-flex items-center gap-0.5">
                  adsb.lol <ExternalLink size={11} />
                </a>. Your location is never sent, and zooming or panning the map requests nothing. It stores nothing.
              </p>
            </div>
          </div>
        </section>

        {/* Section: What we don't do */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={15} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} />
            <h3 className="font-semibold">What we explicitly do <em>not</em> do</h3>
          </div>
          <ul className={`list-none space-y-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {[
              'No Google Analytics, Plausible, Mixpanel, or any analytics service',
              'No error tracking or crash reporting to external services',
              'No session recording or heatmap tools',
              'No advertising or retargeting pixels',
              'No user accounts, authentication, or identity tracking',
              'No server-side database — calendar data is never written to disk',
              'No selling or sharing of any data with third parties',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Section: Self-hosting callout */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Server size={15} className={isDark ? 'text-amber-400' : 'text-amber-600'} />
            <h3 className="font-semibold">Want zero trust? Self-host in 5 minutes.</h3>
          </div>
          <p className={`mb-2 ${isDark ? 'text-slate-300 leading-relaxed' : 'text-slate-600 leading-relaxed'}`}>
            Local .ics file works on the public app without sending calendar data to a server. If you prefer live URL sync, run our pre-built Docker container on your home server or Raspberry Pi, deploy to your
            own Vercel account, or run locally with Bun and no external relay at all.
          </p>
          <Button variant="soft" tone="warning" onClick={onOpenSelfHost} icon={<Server />}>
            Open self-hosting guide
          </Button>
        </section>

        {/* Section: Delete data */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Trash2 size={15} className={isDark ? 'text-rose-400' : 'text-rose-600'} />
            <h3 className="font-semibold">How to delete your data</h3>
          </div>
          <p className={isDark ? 'text-slate-300 leading-relaxed' : 'text-slate-600 leading-relaxed'}>
            Open Settings → Backup & Restore → <strong>"Reset All to Defaults"</strong>, then <strong>Apply</strong>, to wipe all
            stored config. Alternatively, open your browser DevTools (F12) → Application →
            Local Storage → delete the key{' '}
            <code className="px-1 py-0.5 rounded text-xs font-mono bg-black/20">family_dashboard_config_v1</code>.
            After a refresh, the app starts completely fresh.
          </p>
        </section>

        {/* Architecture & Transparency */}
        <section className={`rounded-xl p-4 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-100'}`}>
          <p className={isDark ? 'text-slate-400 text-xs leading-relaxed' : 'text-slate-500 text-xs leading-relaxed'}>
            This app is designed with a strict zero-telemetry architecture. All display preferences and calendar URLs live solely in your browser storage, and no personal data is ever recorded, analyzed, or sold.
          </p>
        </section>

      </div>
    </Dialog>
  )
}
