'use client'

import { BusinessProfileProvider } from '@/contexts/business-profile-context'
import { ErrorBoundary } from '@/components/error-boundary'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <BusinessProfileProvider>
        {children}
      </BusinessProfileProvider>
    </ErrorBoundary>
  )
}