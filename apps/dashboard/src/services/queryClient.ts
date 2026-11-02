import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute fresh
      gcTime: 30 * 60 * 1000, // Keep unused cache for 30 minutes
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchIntervalInBackground: true, // Keep polling active even when dashboard is in a background tab
      retry: 1,
    },
  },
})
