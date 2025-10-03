'use client'

/**
 * Business Context Provider
 *
 * Manages multi-tenant business state including:
 * - All user business memberships
 * - Active business context with permissions
 * - Business switching functionality
 * - Loading and error states
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  TBusinessWithMembership,
  TBusinessContext,
  TSwitchBusinessRequest
} from '@/types/api-contracts'
import {
  getBusinessMemberships,
  getBusinessContext,
  switchBusiness
} from '@/lib/api-client'

// ============================================================================
// Context Types
// ============================================================================

interface BusinessContextState {
  // Data
  memberships: TBusinessWithMembership[]
  activeContext: TBusinessContext | null

  // Loading states
  isLoadingMemberships: boolean
  isLoadingContext: boolean
  isSwitching: boolean

  // Error states
  membershipsError: string | null
  contextError: string | null
  switchError: string | null

  // Actions
  refreshMemberships: () => Promise<void>
  refreshContext: () => Promise<void>
  switchActiveBusiness: (businessId: string) => Promise<boolean>
  clearErrors: () => void
}

const BusinessContext = createContext<BusinessContextState | null>(null)

// ============================================================================
// Provider Component
// ============================================================================

interface BusinessContextProviderProps {
  children: React.ReactNode
}

export function BusinessContextProvider({ children }: BusinessContextProviderProps) {
  // State management
  const [memberships, setMemberships] = useState<TBusinessWithMembership[]>([])
  const [activeContext, setActiveContext] = useState<TBusinessContext | null>(null)

  // Loading states
  const [isLoadingMemberships, setIsLoadingMemberships] = useState(false)
  const [isLoadingContext, setIsLoadingContext] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)

  // Error states
  const [membershipsError, setMembershipsError] = useState<string | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)

  // ============================================================================
  // Data Fetching Functions
  // ============================================================================

  const refreshMemberships = useCallback(async () => {
    setIsLoadingMemberships(true)
    setMembershipsError(null)

    try {
      const response = await getBusinessMemberships()

      if (response.success) {
        setMemberships(response.data.memberships)
        console.log('[BusinessContext] Loaded memberships:', response.data.memberships.length)
      } else {
        // Handle error response
        const errorMsg = ('error' in response ? response.error : 'Failed to load business memberships') as string
        setMembershipsError(errorMsg)
        console.error('[BusinessContext] Error loading memberships:', errorMsg)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error loading memberships'
      setMembershipsError(errorMsg)
      console.error('[BusinessContext] Exception loading memberships:', error)
    } finally {
      setIsLoadingMemberships(false)
    }
  }, [])

  const refreshContext = useCallback(async () => {
    setIsLoadingContext(true)
    setContextError(null)

    try {
      const response = await getBusinessContext()

      if (response.success) {
        setActiveContext(response.data.context)
        console.log('[BusinessContext] Loaded context:', response.data.context?.businessName || 'None')
      } else {
        // Handle error response
        const errorMsg = ('error' in response ? response.error : 'Failed to load business context') as string
        setContextError(errorMsg)
        console.error('[BusinessContext] Error loading context:', errorMsg)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error loading context'
      setContextError(errorMsg)
      console.error('[BusinessContext] Exception loading context:', error)
    } finally {
      setIsLoadingContext(false)
    }
  }, [])

  const switchActiveBusiness = useCallback(async (businessId: string): Promise<boolean> => {
    setIsSwitching(true)
    setSwitchError(null)

    try {
      console.log('[BusinessContext] Switching to business:', businessId)

      const request: TSwitchBusinessRequest = { businessId }
      const response = await switchBusiness(request)

      if (response.success) {
        // Update active context immediately
        setActiveContext(response.data.context)

        // Refresh memberships to update last_accessed_at
        await refreshMemberships()

        console.log('[BusinessContext] Successfully switched to:', response.data.context.businessName)
        return true
      } else {
        // Handle error response
        const errorMsg = ('error' in response ? response.error : 'Failed to switch business') as string
        setSwitchError(errorMsg)
        console.error('[BusinessContext] Error switching business:', errorMsg)
        return false
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error switching business'
      setSwitchError(errorMsg)
      console.error('[BusinessContext] Exception switching business:', error)
      return false
    } finally {
      setIsSwitching(false)
    }
  }, [refreshMemberships])

  // ============================================================================
  // Utility Functions
  // ============================================================================

  const clearErrors = useCallback(() => {
    setMembershipsError(null)
    setContextError(null)
    setSwitchError(null)
  }, [])

  // ============================================================================
  // Effect Hooks
  // ============================================================================

  // Initial data loading
  useEffect(() => {
    console.log('[BusinessContext] Initializing business context')

    // Load both memberships and context in parallel
    Promise.all([
      refreshMemberships(),
      refreshContext()
    ]).then(() => {
      console.log('[BusinessContext] Initial data load complete')
    })
  }, [refreshMemberships, refreshContext])

  // ============================================================================
  // Context Value
  // ============================================================================

  const contextValue: BusinessContextState = {
    // Data
    memberships,
    activeContext,

    // Loading states
    isLoadingMemberships,
    isLoadingContext,
    isSwitching,

    // Error states
    membershipsError,
    contextError,
    switchError,

    // Actions
    refreshMemberships,
    refreshContext,
    switchActiveBusiness,
    clearErrors
  }

  return (
    <BusinessContext.Provider value={contextValue}>
      {children}
    </BusinessContext.Provider>
  )
}

// ============================================================================
// Hook for Consuming Context
// ============================================================================

export function useBusinessContext(): BusinessContextState {
  const context = useContext(BusinessContext)

  if (!context) {
    throw new Error('useBusinessContext must be used within BusinessContextProvider')
  }

  return context
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Get current active business information
 */
export function useActiveBusiness() {
  const { activeContext, isLoadingContext, contextError } = useBusinessContext()

  return {
    business: activeContext,
    isLoading: isLoadingContext,
    error: contextError,
    businessId: activeContext?.businessId || null,
    businessName: activeContext?.businessName || null,
    role: activeContext?.role || null,
    isOwner: activeContext?.isOwner || false,
    permissions: activeContext?.permissions || null
  }
}

/**
 * Get user's business memberships
 */
export function useBusinessMemberships() {
  const {
    memberships,
    isLoadingMemberships,
    membershipsError,
    refreshMemberships
  } = useBusinessContext()

  return {
    memberships,
    isLoading: isLoadingMemberships,
    error: membershipsError,
    refresh: refreshMemberships
  }
}

/**
 * Business switching functionality
 */
export function useBusinessSwitcher() {
  const {
    switchActiveBusiness,
    isSwitching,
    switchError,
    clearErrors
  } = useBusinessContext()

  return {
    switchBusiness: switchActiveBusiness,
    isSwitching,
    error: switchError,
    clearError: clearErrors
  }
}

/**
 * Permission checking helpers
 */
export function usePermissions() {
  const { activeContext } = useBusinessContext()
  const permissions = activeContext?.permissions

  return {
    permissions,
    hasPermission: (permission: keyof typeof permissions) =>
      permissions?.[permission] === true,

    // Convenience permission checks
    canDeleteBusiness: permissions?.canDeleteBusiness === true,
    canManageSubscription: permissions?.canManageSubscription === true,
    canTransferOwnership: permissions?.canTransferOwnership === true,
    canInviteMembers: permissions?.canInviteMembers === true,
    canRemoveMembers: permissions?.canRemoveMembers === true,
    canChangeSettings: permissions?.canChangeSettings === true,
    canApproveExpenses: permissions?.canApproveExpenses === true,
    canManageCategories: permissions?.canManageCategories === true,
    canViewAllData: permissions?.canViewAllData === true,

    // Role-based convenience checks
    isAdmin: activeContext?.role === 'admin',
    isManager: activeContext?.role === 'manager' || activeContext?.role === 'admin',
    isOwner: activeContext?.isOwner === true
  }
}