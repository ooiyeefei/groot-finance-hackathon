'use client'

import { CopilotKit } from '@copilotkit/react-core'
import { useAuth } from '@clerk/nextjs'
import { useMemo } from 'react'

interface CopilotProviderProps {
  children: React.ReactNode
}

/**
 * CopilotKit provider wrapper that handles auth token forwarding from Clerk.
 * Wraps children with the CopilotKit provider configured for our runtime endpoint.
 */
export function CopilotProvider({ children }: CopilotProviderProps) {
  const { getToken } = useAuth()

  // Build auth headers to forward Clerk session token to the CopilotKit runtime
  const headers = useMemo(() => {
    return {
      'x-clerk-auth': 'true',
    }
  }, [])

  return (
    <CopilotKit
      runtimeUrl={process.env.NEXT_PUBLIC_COPILOTKIT_ENDPOINT || '/api/copilotkit'}
      headers={headers}
      showDevConsole={process.env.NODE_ENV === 'development'}
    >
      {children}
    </CopilotKit>
  )
}
