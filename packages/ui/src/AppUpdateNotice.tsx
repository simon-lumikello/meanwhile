import { useEffect } from 'react'
import { Button } from './Button'
import { useAppUpdate } from './useAppUpdate'

const IDLE_RELOAD_MS = 2 * 60 * 1000
const IDLE_EVENTS = ['mousemove', 'keydown', 'touchstart', 'pointerdown'] as const

/**
 * Offers a reload once a newer build is deployed, and reloads by itself after a quiet
 * period, so a wall display picks up releases without anyone touching it.
 */
export function AppUpdateNotice({ idleReloadMs = IDLE_RELOAD_MS }: { idleReloadMs?: number }) {
  const updateAvailable = useAppUpdate()

  useEffect(() => {
    if (!updateAvailable) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => window.location.reload(), idleReloadMs)
    }
    arm()
    IDLE_EVENTS.forEach(type => window.addEventListener(type, arm, { passive: true }))
    return () => {
      clearTimeout(timer)
      IDLE_EVENTS.forEach(type => window.removeEventListener(type, arm))
    }
  }, [updateAvailable, idleReloadMs])

  if (!updateAvailable) return null
  return <div role="status" className="fixed bottom-3 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-200 bg-white py-1.5 pr-1.5 pl-4 text-sm text-slate-800 shadow-xl dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
    <span>A new version is available</span>
    <Button size="sm" variant="solid" tone="primary" pill onClick={() => window.location.reload()}>Reload</Button>
  </div>
}
