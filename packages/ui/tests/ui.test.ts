import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button, Dialog, LocationSearch, buttonClassName } from '../src/react'
import { placePopover } from '../src/anchoredPopover'
import { appVersion } from '../src/vite'

describe('Button', () => {
  it('defaults to a medium neutral solid button of type button', () => {
    const html = renderToStaticMarkup(React.createElement(Button, null, 'Apply'))
    expect(html).toContain('type="button"')
    expect(html).toContain('h-8')
    expect(html).toContain('bg-slate-100')
    expect(html).toContain('>Apply</button>')
  })

  it('renders a small overlay button with its icon before the label', () => {
    const icon = React.createElement('svg', { 'data-icon': 'locate' })
    const html = renderToStaticMarkup(React.createElement(Button, { size: 'sm', variant: 'overlay', tone: 'cyan', icon }, 'Recenter'))
    expect(html).toContain('h-6')
    expect(html).toContain('text-cyan-200')
    expect(html.indexOf('data-icon')).toBeLessThan(html.indexOf('Recenter'))
  })

  it('is square without children', () => {
    const html = renderToStaticMarkup(React.createElement(Button, { 'aria-label': 'Settings', icon: React.createElement('svg') }))
    expect(html).toContain('w-8')
    expect(html).toContain('aria-label="Settings"')
  })

  it('hides its label visually but keeps it as the accessible name and tooltip', () => {
    const html = renderToStaticMarkup(React.createElement(Button, { hideLabel: true, icon: React.createElement('svg') }, 'Next Day'))
    expect(html).toContain('w-8')
    expect(html).toContain('title="Next Day"')
    expect(html).toContain('<span class="sr-only">Next Day</span>')
  })

  it('offers every tone in every variant', () => {
    for (const variant of ['solid', 'soft', 'ghost', 'overlay'] as const) {
      for (const tone of ['primary', 'neutral', 'sky', 'cyan', 'purple', 'warning', 'danger'] as const) {
        expect(buttonClassName({ variant, tone })).toContain('hover:')
        expect(buttonClassName({ variant, tone, inert: true })).not.toContain('hover:')
      }
    }
  })
})

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(React.createElement(Dialog, { open: false, onClose: () => {}, title: 'Settings' }))).toBe('')
  })

  it('is a modal dialog named by its title, with a close button and footer', () => {
    const html = renderToStaticMarkup(React.createElement(Dialog, {
      open: true,
      onClose: () => {},
      title: 'Weather Map settings',
      description: 'Tune the map.',
      closeLabel: 'Close settings',
      footer: React.createElement(Button, { tone: 'primary' }, 'Apply'),
    }, 'Body'))
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1]
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(labelledBy).toBeTruthy()
    expect(html).toContain(`id="${labelledBy}"`)
    expect(html).toContain('aria-label="Close settings"')
    expect(html).toContain('>Apply</button>')
  })

  it('uses a caller-supplied label and no header when untitled', () => {
    const html = renderToStaticMarkup(React.createElement(Dialog, { open: true, onClose: () => {}, labelledBy: 'event-title', showCloseButton: false }, 'Body'))
    expect(html).toContain('aria-labelledby="event-title"')
    expect(html).not.toContain('<h2')
    expect(html).not.toContain('aria-label="Close"')
  })

  it('renders a full-height drawer at the end placement', () => {
    const html = renderToStaticMarkup(React.createElement(Dialog, { open: true, onClose: () => {}, title: 'Settings', placement: 'end', size: 'lg' }))
    expect(html).toContain('justify-end')
    expect(html).toContain('h-full')
  })
})

describe('LocationSearch', () => {
  it('is a combobox showing the saved location with its suggestions closed', () => {
    const html = renderToStaticMarkup(React.createElement(LocationSearch, { label: 'Search location', value: 'Helsinki', onSearch: () => {}, onSelect: () => {}, results: [{ name: 'Tampere', country: 'Finland' }] }))
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-label="Search location"')
    expect(html).toContain('value="Helsinki"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="listbox"')
  })
})

describe('placePopover', () => {
  const viewport = { width: 1000, height: 800 }

  it('opens below the anchor at its width, capped to the room below', () => {
    const style = placePopover({ top: 100, bottom: 140, left: 200, right: 500 }, viewport)
    expect(style).toMatchObject({ position: 'fixed', top: 144, left: 200, minWidth: 300, maxHeight: 800 - 140 - 4 - 8 })
    expect(style.bottom).toBeUndefined()
  })

  it('opens above when the anchor sits near the bottom of the viewport', () => {
    const style = placePopover({ top: 700, bottom: 740, left: 200, right: 500 }, viewport)
    expect(style).toMatchObject({ bottom: 800 - 700 + 4, maxHeight: 700 - 4 - 8 })
    expect(style.top).toBeUndefined()
  })

  it('stays below when there is enough room even if more is available above', () => {
    const style = placePopover({ top: 450, bottom: 490, left: 0, right: 100 }, viewport)
    expect(style.top).toBe(494)
  })

  it('lines up with the anchor end edge when asked', () => {
    const style = placePopover({ top: 100, bottom: 140, left: 200, right: 500 }, viewport, { align: 'end' })
    expect(style).toMatchObject({ right: 500 })
    expect(style.left).toBeUndefined()
  })
})

describe('appVersion', () => {
  it('stamps the page with the build id that version.json carries', () => {
    const plugin = appVersion()
    const transform = plugin.transformIndexHtml as unknown as () => Array<{ attrs: { name: string; content: string } }>
    const [tag] = transform()
    expect(tag.attrs.name).toBe('app-build')
    let emitted = ''
    const generate = plugin.generateBundle as unknown as (this: { emitFile: (file: { fileName: string; source: string }) => void }) => void
    generate.call({ emitFile: file => { emitted = `${file.fileName} ${file.source}` } })
    expect(emitted).toBe(`version.json ${JSON.stringify({ build: tag.attrs.content })}`)
  })
})
