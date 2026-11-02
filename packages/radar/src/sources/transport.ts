export interface RadarTransport { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }
export const browserRadarTransport: RadarTransport = { fetch: (...args) => fetch(...args) }

export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
}
