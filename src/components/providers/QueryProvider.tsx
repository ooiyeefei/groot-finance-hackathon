'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // Create a client instance inside the component to avoid sharing between requests
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          // Configure default query options for optimal performance
          staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
          gcTime: 10 * 60 * 1000, // 10 minutes - cache garbage collection time
          retry: (failureCount, error) => {
            // Only retry on network errors, not 4xx/5xx responses
            if (failureCount >= 3) return false;
            if (error instanceof Error && error.message.includes('4')) return false;
            return true;
          },
          refetchOnWindowFocus: false, // Disable automatic refetch on window focus
          refetchOnReconnect: true, // Refetch when reconnecting to network
        },
      },
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Enable React Query DevTools in development */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}