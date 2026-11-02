import React from 'react'
import { Button, Dialog } from '@simon-lumikello/meanwhile-ui/react'
import { CloudSun, Users, ArrowRight, ShieldCheck, Sparkles, AlertTriangle } from 'lucide-react'

interface WelcomeDialogProps {
  isDark: boolean
  demoCity: string
  onDismiss: () => void
  onOpenPrivacy: () => void
  onOpenSelfHost: () => void
}

export const WelcomeDialog: React.FC<WelcomeDialogProps> = ({
  isDark,
  demoCity,
  onDismiss,
  onOpenPrivacy,
  onOpenSelfHost,
}) => {
  return (
    <Dialog open onClose={onDismiss} labelledBy="welcome-title" showCloseButton={false} flush className="animate-[fadeSlideUp_0.35s_ease-out]">
      {/* Gradient accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500" />

      <div className="px-6 pt-5 pb-5">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className={`
            p-2.5 rounded-xl shrink-0
            ${isDark ? 'bg-indigo-500/15' : 'bg-indigo-50'}
          `}>
            <Sparkles size={22} className="text-indigo-400" />
          </div>
          <div>
            <h1 id="welcome-title" className="text-lg font-bold leading-tight">Welcome to Meanwhile</h1>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Your family's day, at a glance
            </p>
          </div>
        </div>

        {/* Feature bullets */}
        <div className="space-y-2.5 mb-4">
          <FeatureLine icon={<Users size={15} />} color="violet" dark={isDark}>
            <strong>Parallel Lanes</strong> — see everyone's schedule side-by-side on a 24-hour timeline. Scroll or tap to explore the day.
          </FeatureLine>
          <FeatureLine icon={<CloudSun size={15} />} color="sky" dark={isDark}>
            <strong>Live weather</strong> — currently showing FMI forecast for <strong>{demoCity}</strong>. Change the city anytime in Settings.
          </FeatureLine>
        </div>

        {/* Loud iCal Feeds & Privacy Notice */}
        <div className={`
          rounded-xl p-3.5 mb-4 border-2 text-xs leading-relaxed transition-all
          ${isDark
            ? 'bg-amber-500/10 border-amber-500/35 text-slate-200 shadow-md shadow-amber-950/20'
            : 'bg-amber-50/90 border-amber-300 text-slate-800 shadow-sm'}
        `}>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <AlertTriangle size={15} className={isDark ? 'text-amber-400' : 'text-amber-600'} />
              <span className={isDark ? 'text-amber-300' : 'text-amber-900'}>
                iCal Feeds & Privacy Notice
              </span>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              isDark
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                : 'bg-amber-100 border-amber-300 text-amber-800'
            }`}>
              Essential Setup
            </span>
          </div>

          <p className="mb-2">
            <strong>Use your own calendars:</strong> You are currently seeing sample events. In Settings → Lanes, choose Local .ics file to import each person's calendar without uploading it, or connect a calendar URL for automatic sync.
          </p>

          <p className={`mb-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            <strong>For calendar URLs:</strong> Browsers cannot directly reach Google Calendar due to CORS policy, so requests route through our relay (<code className="px-1 py-0.5 rounded font-mono bg-black/20">/api/ical-proxy</code>). We write nothing to a database, but Vercel platform logs retain query strings (including your iCal URL) for up to 30 days.
          </p>

          <p className="mb-2.5 font-medium text-emerald-700 dark:text-emerald-400">
            Safe alternative on the public app: Local .ics file keeps your calendar on this device and bypasses the relay. Re-import the file when your schedule changes.
          </p>
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-500/20 text-[11px]">
            <span className={isDark ? 'text-amber-200/80' : 'text-amber-900/80'}>
              Want zero intermediary logs?
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                id="welcome-selfhost-btn"
                onClick={onOpenSelfHost}
                className="font-medium text-indigo-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                Self-host proxy
              </button>
              <button
                id="welcome-privacy-link"
                onClick={onOpenPrivacy}
                className="font-medium underline cursor-pointer text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Full privacy details →
              </button>
            </div>
          </div>
        </div>

        {/* Local storage note */}
        <p className={`text-xs mb-4 flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <ShieldCheck size={13} className="shrink-0 text-emerald-400" />
          <span>
            Lane names, colors, and layout preferences stay saved 100% locally in your browser's localStorage.
          </span>
        </p>

        {/* CTA */}
        <Button
          id="welcome-dismiss-btn"
          size="lg"
          tone="primary"
          fullWidth
          onClick={onDismiss}
          iconEnd={<ArrowRight />}
        >
          Got it — let me explore
        </Button>
      </div>
    </Dialog>
  )
}

// ── Sub-component ─────────────────────────────────────────────────────────────

type ColorKey = 'violet' | 'sky' | 'emerald'

const colorMap: Record<ColorKey, { bg: string; darkBg: string; text: string }> = {
  violet: { bg: 'bg-violet-50', darkBg: 'bg-violet-500/10', text: 'text-violet-400' },
  sky:    { bg: 'bg-sky-50',    darkBg: 'bg-sky-500/10',    text: 'text-sky-400' },
  emerald:{ bg: 'bg-emerald-50',darkBg: 'bg-emerald-500/10',text: 'text-emerald-400' },
}

function FeatureLine({
  icon,
  color,
  dark,
  children,
}: {
  icon: React.ReactNode
  color: ColorKey
  dark: boolean
  children: React.ReactNode
}) {
  const c = colorMap[color]
  return (
    <div className="flex gap-3 items-start">
      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${dark ? c.darkBg : c.bg}`}>
        <span className={c.text}>{icon}</span>
      </div>
      <p className={`text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
        {children}
      </p>
    </div>
  )
}
