import { afterEach, describe, expect, it } from 'bun:test'
import { copyText } from '@dashboard/utils/clipboard'

// Stand-ins for the browser globals copyText reads, typed against the parts it uses.
type FakeTextArea = Pick<HTMLTextAreaElement, 'value'> & {
  style: Pick<CSSStyleDeclaration, 'position' | 'opacity'>
  setAttribute: (name: string, value: string) => void
  select: () => void
  remove: () => void
}

interface BrowserStubs {
  secure: boolean
  writeText?: (text: string) => Promise<void>
  execCommand?: (command: string) => boolean
}

const original = {
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
}

function restore(name: keyof typeof original) {
  const descriptor = original[name]
  if (descriptor) Object.defineProperty(globalThis, name, descriptor)
  else Reflect.deleteProperty(globalThis, name)
}

afterEach(() => {
  restore('window')
  restore('navigator')
  restore('document')
})

function stubBrowser({ secure, writeText, execCommand = () => true }: BrowserStubs) {
  const written: string[] = []
  const commands: string[] = []
  const attached: FakeTextArea[] = []
  const removed: FakeTextArea[] = []
  const textArea: FakeTextArea = {
    value: '',
    style: { position: '', opacity: '' },
    setAttribute: () => {},
    select: () => {},
    remove: () => removed.push(textArea),
  }
  const define = (name: string, value: object) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  define('window', { isSecureContext: secure })
  define('navigator', writeText ? { clipboard: { writeText: async (text: string) => { written.push(text); await writeText(text) } } } : {})
  define('document', {
    createElement: () => textArea,
    body: { appendChild: (node: FakeTextArea) => attached.push(node) },
    execCommand: (command: string) => {
      commands.push(command)
      return execCommand(command)
    },
  })
  return { written, commands, attached, removed, textArea }
}

describe('copyText', () => {
  it('uses the Clipboard API in a secure context', async () => {
    const browser = stubBrowser({ secure: true, writeText: async () => {} })
    expect(await copyText('docker run')).toBe(true)
    expect(browser.written).toEqual(['docker run'])
    expect(browser.commands).toEqual([])
  })

  it('falls back to a hidden textarea over plain HTTP, where the Clipboard API is missing', async () => {
    const browser = stubBrowser({ secure: false })
    expect(await copyText('docker run')).toBe(true)
    expect(browser.textArea.value).toBe('docker run')
    expect(browser.commands).toEqual(['copy'])
    expect(browser.removed).toEqual(browser.attached)
  })

  it('falls back when the Clipboard API refuses', async () => {
    const browser = stubBrowser({ secure: true, writeText: async () => { throw new DOMException('Denied', 'NotAllowedError') } })
    expect(await copyText('docker run')).toBe(true)
    expect(browser.commands).toEqual(['copy'])
  })

  it('reports failure without throwing and always removes the textarea', async () => {
    const refused = stubBrowser({ secure: false, execCommand: () => false })
    expect(await copyText('docker run')).toBe(false)
    expect(refused.removed).toEqual(refused.attached)

    const thrown = stubBrowser({ secure: false, execCommand: () => { throw new Error('unsupported') } })
    expect(await copyText('docker run')).toBe(false)
    expect(thrown.removed).toHaveLength(1)
  })
})
