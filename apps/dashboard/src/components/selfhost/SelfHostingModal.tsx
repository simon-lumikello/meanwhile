import React from 'react'
import { Button, Dialog } from '@simon-lumikello/meanwhile-ui/react'
import { Server, Copy, Check, Terminal, Cpu, ShieldCheck } from 'lucide-react'
import { useCopyFeedback, type CopyFeedback } from '@dashboard/hooks/useCopyFeedback'

interface SelfHostingModalProps {
  isOpen: boolean
  onClose: () => void
  isDark: boolean
}

const DOCKER_RUN_CMD = `docker run -d \\
  --name meanwhile \\
  --restart unless-stopped \\
  -p 3000:3000 \\
  ghcr.io/simon-lumikello/meanwhile:latest`

const DOCKER_COMPOSE_YML = `services:
  meanwhile:
    image: ghcr.io/simon-lumikello/meanwhile:latest
    ports:
      - "3000:3000"
    restart: unless-stopped`

const KIOSK_CMD = `chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:3000`

interface CopyButtonProps {
  copyKey: string
  text: string
  feedback: CopyFeedback | null
  onCopy: (key: string, text: string) => void
}

const CopyButton: React.FC<CopyButtonProps> = ({ copyKey, text, feedback, onCopy }) => {
  const outcome = feedback?.key === copyKey ? feedback.copied : null
  return (
    <Button
      size="sm"
      variant="soft"
      tone="neutral"
      onClick={() => onCopy(copyKey, text)}
      icon={outcome ? <Check className="text-emerald-400" /> : <Copy />}
    >
      {outcome === null ? 'Copy' : outcome ? 'Copied' : 'Copy failed'}
    </Button>
  )
}

export const SelfHostingModal: React.FC<SelfHostingModalProps> = ({ isOpen, onClose, isDark }) => {
  const { feedback, copy } = useCopyFeedback(2000)
  const handleCopy = (key: string, text: string) => void copy(key, text)

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      icon={<Server size={20} className="text-amber-400" />}
      title="Self-Hosting Guide"
      description="Run completely on your own hardware with 100% calendar privacy"
      footer={
        <Button size="lg" variant="solid" tone="primary" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <div className="space-y-6 text-sm">
        {/* Why Self Host */}
        <div className={`rounded-xl p-4 border ${
          isDark
            ? 'bg-amber-500/10 border-amber-500/25 text-amber-200'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <p className="font-semibold text-xs mb-1 flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-amber-400 shrink-0" />
            Why self-host?
          </p>
          <p className="text-xs leading-relaxed">
            For an on-device alternative on the public app, choose Settings → Lanes → Calendar source → Local .ics file, select an exported calendar, and press Apply. It is never uploaded; re-import it to update events. For automatic sync, Google Calendar secret iCal links are permanent read tokens. Browsers block direct calendar requests due to CORS restrictions, so feeds must route through a proxy. Self-hosting runs this lightweight proxy on your own local server or Raspberry Pi, ensuring your iCal URLs never touch third-party cloud hosting logs.
          </p>
        </div>

        {/* Option A: Quickstart Docker */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={16} className="text-indigo-400" />
              <h3 className="font-semibold text-sm">Option 1 · One-Command Docker Quickstart</h3>
            </div>
            <CopyButton copyKey="docker-run" text={DOCKER_RUN_CMD} feedback={feedback} onCopy={handleCopy} />
          </div>
          <pre className="p-3 rounded-xl font-mono text-xs overflow-x-auto bg-black/40 border border-white/10 text-slate-200 leading-relaxed">
            {DOCKER_RUN_CMD}
          </pre>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Then open <code className="px-1 py-0.5 rounded text-[11px] font-mono bg-black/20">http://localhost:3000</code> in your browser.
          </p>
        </section>

        {/* Option B: Docker Compose */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server size={16} className="text-violet-400" />
              <h3 className="font-semibold text-sm">Option 2 · docker-compose.yml</h3>
            </div>
            <CopyButton copyKey="docker-compose" text={DOCKER_COMPOSE_YML} feedback={feedback} onCopy={handleCopy} />
          </div>
          <pre className="p-3 rounded-xl font-mono text-xs overflow-x-auto bg-black/40 border border-white/10 text-slate-200 leading-relaxed">
            {DOCKER_COMPOSE_YML}
          </pre>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Start with <code className="px-1 py-0.5 rounded text-[11px] font-mono bg-black/20">docker compose up -d</code>.
          </p>
        </section>

        {/* Raspberry Pi Wall Display */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-rose-400" />
              <h3 className="font-semibold text-sm">Raspberry Pi · Wall Display Kiosk</h3>
            </div>
            <CopyButton copyKey="kiosk-cmd" text={KIOSK_CMD} feedback={feedback} onCopy={handleCopy} />
          </div>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            The Docker container image supports both <code className="px-1 py-0.5 rounded text-[11px] font-mono bg-black/20">amd64</code> and <code className="px-1 py-0.5 rounded text-[11px] font-mono bg-black/20">arm64</code> (Raspberry Pi 4 and 5).
            To launch in full-screen wall display mode:
          </p>
          <pre className="p-3 rounded-xl font-mono text-xs overflow-x-auto bg-black/40 border border-white/10 text-slate-200 leading-relaxed">
            {KIOSK_CMD}
          </pre>
        </section>

        {/* Proxy Architecture Details */}
        <section className={`rounded-xl p-4 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
          <h4 className="font-semibold text-xs mb-2">How the local proxy operates</h4>
          <ul className={`space-y-1.5 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            <li className="flex items-start gap-2">
              <Check size={14} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>Fetches your raw <code className="font-mono text-[11px]">.ics</code> calendar stream directly from Google on demand</span>
            </li>
            <li className="flex items-start gap-2">
              <Check size={14} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>Caches feed responses in memory for ~3 minutes to minimize network requests</span>
            </li>
            <li className="flex items-start gap-2">
              <Check size={14} className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>Never saves calendar URLs or events to any database or disk file</span>
            </li>
          </ul>
        </section>
      </div>
    </Dialog>
  )
}
