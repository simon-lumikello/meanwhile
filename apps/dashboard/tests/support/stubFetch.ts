/** A typed stand-in for `fetch` in tests: the handler, plus the no-op `preconnect` the `fetch` type requires. */
export function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch {
  return Object.assign(handler, { preconnect: () => {} })
}
