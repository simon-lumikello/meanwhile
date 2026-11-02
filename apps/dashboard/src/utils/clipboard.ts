/**
 * Copies text to the clipboard and resolves to whether it worked.
 *
 * The Clipboard API exists only in secure contexts, and self-hosted displays often run over plain
 * HTTP (`http://192.168.x.x:3000`), so this falls back to selecting a hidden textarea and
 * `document.execCommand('copy')`. It never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or the document is not focused: try the fallback.
    }
  }
  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  try {
    textArea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textArea.remove()
  }
}
