import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

const CHECK_INTERVAL_MS = 5 * 60 * 1000

const readBuild = () => document.querySelector('meta[name="app-build"]')?.getAttribute('content') ?? null

async function fetchDeployedBuild(signal: AbortSignal): Promise<string | null> {
  const response = await fetch('/version.json', { cache: 'no-cache', signal })
  if (!response.ok) throw new Error(`version.json: ${response.status}`)
  const data: unknown = await response.json()
  return typeof data === 'object' && data !== null && 'build' in data && typeof data.build === 'string' ? data.build : null
}

/**
 * Whether a newer build than the running one is deployed. It checks on an interval and
 * when the window regains focus, under the host's `QueryClientProvider`. Without a build
 * stamp in the page (dev server, or a build without `appVersion()`) it never reports one.
 */
export function useAppUpdate(): boolean {
  const [running] = useState(readBuild)
  const { data } = useQuery({
    queryKey: ['app-build'],
    queryFn: ({ signal }) => fetchDeployedBuild(signal),
    enabled: running !== null,
    refetchInterval: CHECK_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: CHECK_INTERVAL_MS / 2,
    retry: false,
  })
  return running !== null && Boolean(data) && data !== running
}
