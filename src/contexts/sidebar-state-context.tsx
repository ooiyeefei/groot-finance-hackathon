'use client'

import React, { createContext, useContext } from 'react'

interface SidebarStateContextType {
  isInitiallyExpanded: boolean
}

const SidebarStateContext = createContext<SidebarStateContextType | undefined>(undefined)

interface SidebarStateProviderProps {
  children: React.ReactNode
  initialState: {
    isInitiallyExpanded: boolean
  }
}

export function SidebarStateProvider({ children, initialState }: SidebarStateProviderProps) {
  // DEBUG LOGGING: Track initial state from server
  console.log('[SidebarStateProvider] Initialized with state:', {
    isInitiallyExpanded: initialState.isInitiallyExpanded,
    timestamp: new Date().toISOString()
  })

  return (
    <SidebarStateContext.Provider value={initialState}>
      {children}
    </SidebarStateContext.Provider>
  )
}

export function useSidebarState() {
  const context = useContext(SidebarStateContext)
  if (context === undefined) {
    throw new Error('useSidebarState must be used within a SidebarStateProvider')
  }

  // DEBUG LOGGING: Track hook usage
  console.log('[useSidebarState] Hook called, returning context:', {
    isInitiallyExpanded: context.isInitiallyExpanded,
    timestamp: new Date().toISOString()
  })

  return context
}