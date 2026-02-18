/**
 * UnsavedChangesProvider
 * 
 * Context provider to track unsaved changes across the application.
 * Components can register their dirty state, and the provider will
 * warn users when they try to navigate away with unsaved changes.
 */

'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface UnsavedChangesContextType {
  registerDirtyState: (id: string, isDirty: boolean) => void
  unregisterDirtyState: (id: string) => void
  hasUnsavedChanges: boolean
  confirmNavigation: () => boolean
  setMessage: (message: string) => void
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType | undefined>(undefined)

interface UnsavedChangesProviderProps {
  children: React.ReactNode
  defaultMessage?: string
}

export function UnsavedChangesProvider({ 
  children, 
  defaultMessage = 'You have unsaved changes. Are you sure you want to leave?' 
}: UnsavedChangesProviderProps) {
  const [dirtyStates, setDirtyStates] = useState<Map<string, boolean>>(new Map())
  const [message, setMessageState] = useState(defaultMessage)
  const pathname = usePathname()
  const previousPathname = useRef(pathname)

  const hasUnsavedChanges = Array.from(dirtyStates.values()).some(isDirty => isDirty)

  const registerDirtyState = useCallback((id: string, isDirty: boolean) => {
    setDirtyStates(prev => {
      const next = new Map(prev)
      next.set(id, isDirty)
      return next
    })
  }, [])

  const unregisterDirtyState = useCallback((id: string) => {
    setDirtyStates(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const setMessage = useCallback((newMessage: string) => {
    setMessageState(newMessage)
  }, [])

  const confirmNavigation = useCallback(() => {
    if (!hasUnsavedChanges) return true
    return window.confirm(message)
  }, [hasUnsavedChanges, message])

  // Handle browser beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return
      
      e.preventDefault()
      e.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges, message])

  // Handle Next.js navigation
  useEffect(() => {
    if (previousPathname.current !== pathname && hasUnsavedChanges) {
      // Navigation occurred - we would have shown confirmation via link interception
      previousPathname.current = pathname
    }
  }, [pathname, hasUnsavedChanges])

  // Intercept link clicks at document level
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!hasUnsavedChanges) return

      const target = e.target as HTMLElement
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('http') || anchor.hasAttribute('download')) {
        return
      }

      // Check if this is an internal navigation
      if (href.startsWith('/')) {
        const confirmed = window.confirm(message)
        if (!confirmed) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [hasUnsavedChanges, message])

  return (
    <UnsavedChangesContext.Provider value={{
      registerDirtyState,
      unregisterDirtyState,
      hasUnsavedChanges,
      confirmNavigation,
      setMessage
    }}>
      {children}
    </UnsavedChangesContext.Provider>
  )
}

export function useUnsavedChangesContext() {
  const context = useContext(UnsavedChangesContext)
  if (context === undefined) {
    throw new Error('useUnsavedChangesContext must be used within an UnsavedChangesProvider')
  }
  return context
}

/**
 * useRegisterUnsavedChanges Hook
 * 
 * Hook for individual components to register their dirty state.
 */
export function useRegisterUnsavedChanges(id: string, isDirty: boolean) {
  const { registerDirtyState, unregisterDirtyState } = useUnsavedChangesContext()

  useEffect(() => {
    registerDirtyState(id, isDirty)
    return () => unregisterDirtyState(id)
  }, [id, isDirty, registerDirtyState, unregisterDirtyState])
}

export default UnsavedChangesProvider
