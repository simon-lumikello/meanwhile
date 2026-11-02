import { describe, expect, it } from 'bun:test'
import { stubFetch } from './support/stubFetch'
import { fetchExternal, validateExternalHttpUrl } from '../server/proxySecurity.ts'

describe('proxy target validation', () => {
  it('allows public HTTP and HTTPS calendar feeds', () => {
    expect(validateExternalHttpUrl('https://calendar.example.com/family.ics').url?.hostname)
      .toBe('calendar.example.com')
    expect(validateExternalHttpUrl('http://198.51.100.12/feed.ics').url?.hostname)
      .toBe('198.51.100.12')
  })

  it('rejects non-HTTP protocols, credentials, and private network targets', () => {
    for (const target of [
      'file:///etc/passwd',
      'https://user:password@example.com/feed.ics',
      'http://localhost:3000/admin',
      'http://127.0.0.1:3000/admin',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.5/feed.ics',
      'http://[::1]/admin',
    ]) {
      expect(validateExternalHttpUrl(target).error).toBeDefined()
    }
  })

  it('follows a calendar provider redirect to another public HTTPS URL', async () => {
    const originalFetch = globalThis.fetch
    const requestedUrls: string[] = []

    try {
      globalThis.fetch = stubFetch(async (input: string | URL | Request) => {
        const url = String(input)
        requestedUrls.push(url)

        if (url === 'https://calendar.google.com/family.ics') {
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://calendar.googleusercontent.com/family.ics' },
          })
        }

        return new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR', {
          status: 200,
          headers: { 'Content-Type': 'text/calendar' },
        })
      })

      const response = await fetchExternal(new URL('https://calendar.google.com/family.ics'))

      expect(response.status).toBe(200)
      expect(await response.text()).toContain('BEGIN:VCALENDAR')
      expect(requestedUrls).toEqual([
        'https://calendar.google.com/family.ics',
        'https://calendar.googleusercontent.com/family.ics',
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('rejects a calendar provider redirect to a private network target', async () => {
    const originalFetch = globalThis.fetch

    try {
      globalThis.fetch = stubFetch(async () => new Response(null, {
        status: 302,
        headers: { Location: 'http://169.254.169.254/latest/meta-data' },
      }))

      await expect(
        fetchExternal(new URL('https://calendar.example.com/family.ics'))
      ).rejects.toThrow('Private network addresses are not allowed')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
