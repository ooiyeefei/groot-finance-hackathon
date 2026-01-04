'use client'

import { ErrorBoundary } from '@/components/error-boundary'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import { ConvexClientProvider } from './ConvexClientProvider'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  // Create QueryClient instance per component to avoid state sharing between requests
  // Using useState ensures it's only created once per component lifecycle
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // PERFORMANCE: Intelligent caching with staleTime
            staleTime: 1000 * 60 * 5, // 5 minutes - data is considered fresh
            gcTime: 1000 * 60 * 30, // 30 minutes - cache time (formerly cacheTime)
            refetchOnWindowFocus: false, // Don't refetch when user returns to tab
            refetchOnReconnect: true, // Refetch when internet connection restored
            retry: 1, // Only retry failed requests once
          },
          mutations: {
            retry: false, // Don't retry failed mutations automatically
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ConvexClientProvider>
        <ErrorBoundary>{children}</ErrorBoundary>
      </ConvexClientProvider>
      {/* React Query DevTools for debugging (only in development) */}
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  )
}