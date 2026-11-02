import { useEffect, useRef, useState } from 'react'
import { copyText } from '@dashboard/utils/clipboard'

export interface CopyFeedback {
  /** Which of the component's copy buttons was used. */
  key: string
  copied: boolean
}

/**
 * Copies text and shows the outcome for `durationMs`: `feedback` names the button and whether the
 * copy worked. One timer at a time, cleared on unmount.
 */
export function useCopyFeedback(durationMs: number) {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const copy = async (key: string, text: string): Promise<boolean> => {
    const copied = await copyText(text)
    clearTimeout(timerRef.current)
    setFeedback({ key, copied })
    timerRef.current = setTimeout(() => setFeedback(null), durationMs)
    return copied
  }

  return { feedback, copy }
}
