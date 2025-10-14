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
import { useAuth } from '@clerk/nextjs'
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

interface BusinessProfile {
  id: string
  name: string
  logo_url?: string
  logo_fallback_color?: string
}

interface BusinessContextState {
  // Data
  memberships: TBusinessWithMembership[]
  activeContext: TBusinessContext | null
  profile: BusinessProfile | null

  // Loading states
  isLoadingMemberships: boolean
  isLoadingContext: boolean
  isSwitching: boolean
  isLoadingProfile: boolean

  // Error states
  membershipsError: string | null
  contextError: string | null
  switchError: string | null
  profileError: string | null

  // Actions
  refreshMemberships: () => Promise<void>
  refreshContext: () => Promise<void>
  switchActiveBusiness: (businessId: string) => Promise<boolean>
  clearErrors: () => void
  refreshProfile: () => Promise<void>
  updateProfile: (updatedProfile: BusinessProfile) => void
}

const BusinessContext = createContext<BusinessContextState | null>(null)

// ============================================================================
// Provider Component
// ============================================================================

interface BusinessContextProviderProps {
  children: React.ReactNode
}

export function BusinessContextProvider({ children }: BusinessContextProviderProps) {
  // Clerk authentication
  const { isLoaded: isAuthLoaded, isSignedIn, userId } = useAuth()

  // Helper to get initial profile from localStorage
  const getInitialProfile = (): BusinessProfile | null => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('business-profile')
        return cached ? JSON.parse(cached) : null
      } catch (error) {
        console.warn('[BusinessContext] Failed to parse cached business profile:', error)
        return null
      }
    }
    return null
  }

  // State management
  const [memberships, setMemberships] = useState<TBusinessWithMembership[]>([])
  const [activeContext, setActiveContext] = useState<TBusinessContext | null>(null)
  const [profile, setProfile] = useState<BusinessProfile | null>(getInitialProfile())

  // Loading states
  const [isLoadingMemberships, setIsLoadingMemberships] = useState(false)
  const [isLoadingContext, setIsLoadingContext] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [isLoadingProfile, setIsLoadingProfile] = useState(!profile) // Only loading if no cached data

  // Error states
  const [membershipsError, setMembershipsError] = useState<string | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Removed: hasAttemptedSessionReload state (no longer needed without page reload logic)

  // Track if initial data load has completed to prevent premature redirects
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false)

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

      // For new users, this is expected - don't treat as error
      if (errorMsg.includes('User not found') || errorMsg.includes('500')) {
        console.log('[BusinessContext] New user detected, no memberships yet:', errorMsg)
        setMemberships([])
        setMembershipsError(null) // Clear error for new users
      } else {
        setMembershipsError(errorMsg)
        console.error('[BusinessContext] Exception loading memberships:', error)
      }
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

      // For new users, this is expected - don't treat as error
      if (errorMsg.includes('User not found') || errorMsg.includes('500')) {
        console.log('[BusinessContext] New user detected, no business context yet:', errorMsg)
        setActiveContext(null)
        setContextError(null) // Clear error for new users
      } else {
        setContextError(errorMsg)
        console.error('[BusinessContext] Exception loading context:', error)
      }
    } finally {
      setIsLoadingContext(false)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    setIsLoadingProfile(true)
    setProfileError(null)

    try {
      const response = await fetch('/api/v1/account-management/businesses/profile')
      const result = await response.json()

      if (result.success) {
        setProfile(result.data)
        // Cache the result for instant loading on future visits
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('business-profile', JSON.stringify(result.data))
          } catch (error) {
            console.warn('[BusinessContext] Failed to cache business profile:', error)
          }
        }
        console.log('[BusinessContext] Loaded profile:', result.data.name)
      } else {
        const errorMsg = result.error || 'Failed to fetch business profile'
        setProfileError(errorMsg)
        console.error('[BusinessContext] Error loading profile:', errorMsg)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error loading profile'
      setProfileError(errorMsg)
      console.error('[BusinessContext] Exception loading profile:', error)
    } finally {
      setIsLoadingProfile(false)
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

        // Refresh profile for new business
        await refreshProfile()

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
  }, [refreshMemberships, refreshProfile])

  const updateProfile = useCallback((updatedProfile: BusinessProfile) => {
    setProfile(updatedProfile)
    // Update cache when profile is updated
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('business-profile', JSON.stringify(updatedProfile))
      } catch (error) {
        console.warn('[BusinessContext] Failed to update cached business profile:', error)
      }
    }
  }, [])

  // ============================================================================
  // Utility Functions
  // ============================================================================

  const clearErrors = useCallback(() => {
    setMembershipsError(null)
    setContextError(null)
    setSwitchError(null)
    setProfileError(null)
  }, [])

  // ============================================================================
  // Effect Hooks
  // ============================================================================

  // Initial data loading - only when authenticated
  useEffect(() => {
    // Only load data if Clerk is loaded and user is signed in
    if (!isAuthLoaded || !isSignedIn || !userId) {
      console.log('[BusinessContext] Waiting for authentication...', { isAuthLoaded, isSignedIn, userId: !!userId })
      return
    }

    console.log('[BusinessContext] Initializing business context for authenticated user')

    // Load initial data without artificial delays
    const loadData = async () => {
      try {
        // Load memberships first, then context to avoid duplicate user creation attempts
        await refreshMemberships()
        await refreshContext()
        await refreshProfile() // Load profile data

        console.log('[BusinessContext] ✅ Initial data load complete')
        setHasCompletedInitialLoad(true)
      } catch (error) {
        console.error('[BusinessContext] Error during initial data load:', error)
      }
    }

    loadData()
  }, [isAuthLoaded, isSignedIn, userId, refreshMemberships, refreshContext, refreshProfile])

  // Auto-switch and redirect logic
  useEffect(() => {
    // Don't run if still loading data or already switching
    if (isLoadingMemberships || isLoadingContext || isSwitching || !isAuthLoaded || !isSignedIn) {
      console.log('[BusinessContext] ⏳ Skipping redirect logic - still loading or not authenticated:', {
        isLoadingMemberships,
        isLoadingContext,
        isSwitching,
        isAuthLoaded,
        isSignedIn
      })
      return
    }

    // CRITICAL: Don't run redirect logic until initial data load is complete
    // This prevents false "no memberships" detection during the loading phase
    if (!hasCompletedInitialLoad) {
      console.log('[BusinessContext] 🔄 Waiting for initial data load to complete...', {
        hasCompletedInitialLoad,
        membershipsLength: memberships?.length,
        hasActiveContext: !!activeContext
      })
      return
    }

    const hasMemberships = memberships && memberships.length > 0
    const hasNoActiveContext = activeContext === null

    console.log('[BusinessContext] Redirect logic evaluation:', {
      hasMemberships,
      hasNoActiveContext,
      membershipsCount: memberships?.length || 0,
      activeContextExists: !!activeContext,
      membershipsError: !!membershipsError,
      memberships: memberships,
      activeContext: activeContext
    })

    if (hasMemberships && hasNoActiveContext) {
      // Case 1: User has memberships but no active context (needs auto-switch)
      console.log('[BusinessContext] Auto-switch detected: User has memberships but no active context')

      // Find the most recently accessed business (memberships are ordered by last_accessed_at DESC)
      const mostRecentBusiness = memberships[0]

      if (mostRecentBusiness) {
        console.log('[BusinessContext] Auto-switching to most recent business:', mostRecentBusiness.name)

        // Auto-switch to the most recently accessed business
        switchActiveBusiness(mostRecentBusiness.id).then((success) => {
          if (success) {
            console.log('[BusinessContext] Auto-switch successful:', mostRecentBusiness.name)
          } else {
            console.error('[BusinessContext] Auto-switch failed for business:', mostRecentBusiness.id)
          }
        }).catch((error) => {
          console.error('[BusinessContext] Auto-switch error:', error)
        })
      }
    } else if (!hasMemberships && hasNoActiveContext && !membershipsError) {
      // Case 2: User has NO memberships and NO context (could be stale JWT or truly new user)
      console.log('[BusinessContext] ⚠️ No memberships detected, but checking conditions first...', {
        hasMemberships,
        hasNoActiveContext,
        membershipsError,
        membershipsLength: memberships?.length,
        activeContextValue: activeContext
      })

      // FIXED: Direct redirect to onboarding without dangerous reload logic
      const currentPath = window.location.pathname
      const isOnOnboardingPage = currentPath.includes('/onboarding/')
      const isOnDashboardPage = currentPath === '/en' || currentPath === '/' ||
                               currentPath.match(/^\/(en|th|id|zh)$/)

      // Only redirect if we're on dashboard page and not already on onboarding
      if (isOnDashboardPage && !isOnOnboardingPage) {
        console.log('[BusinessContext] 📍 No business context detected - direct redirect to onboarding')
        proceedToOnboarding()
      } else {
        console.log('[BusinessContext] ✋ Already on onboarding or non-dashboard page, no action needed')
      }

      function proceedToOnboarding() {
        console.log('[BusinessContext] 📍 Proceeding with onboarding redirect (confirmed no business)', {
          isOnOnboardingPage,
          isOnDashboardPage
        })

        // Don't redirect if already on onboarding page (prevents infinite loop)
        if (!isOnOnboardingPage) {
          // Redirect to business onboarding
          const locale = window.location.pathname.match(/^\/(en|th|id|zh)/)?.[1] || 'en'
          const onboardingUrl = `/${locale}/onboarding/business`

          console.log(`[BusinessContext] ➡️ Redirecting to: ${onboardingUrl}`)
          window.location.href = onboardingUrl
        } else {
          console.log('[BusinessContext] ✋ Already on onboarding page, skipping redirect')
        }
      }
    }
  }, [memberships, activeContext, isLoadingMemberships, isLoadingContext, isSwitching, isAuthLoaded, isSignedIn, membershipsError, switchActiveBusiness, hasCompletedInitialLoad])

  // ============================================================================
  // Context Value
  // ============================================================================

  const contextValue: BusinessContextState = {
    // Data
    memberships,
    activeContext,
    profile,

    // Loading states
    isLoadingMemberships,
    isLoadingContext,
    isSwitching,
    isLoadingProfile,

    // Error states
    membershipsError,
    contextError,
    switchError,
    profileError,

    // Actions
    refreshMemberships,
    refreshContext,
    switchActiveBusiness,
    clearErrors,
    refreshProfile,
    updateProfile
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

/**
 * Business state detection helpers
 */
export function useBusinessState() {
  const {
    memberships,
    activeContext,
    isLoadingMemberships,
    isLoadingContext,
    membershipsError,
    contextError
  } = useBusinessContext()

  // Determine if user has any business associations
  const hasMemberships = memberships && memberships.length > 0
  const hasActiveContext = activeContext !== null

  // Determine if we're still loading initial data
  const isInitialLoading = isLoadingMemberships || isLoadingContext

  // Determine if there are actual errors (not just "no data" situations)
  const hasActualError = (membershipsError && !membershipsError.includes('User not found') && !membershipsError.includes('500')) ||
                         (contextError && !contextError.includes('User not found') && !contextError.includes('500'))

  // Determine if user is in a "no business access" state
  const hasNoBusinessAccess = !isInitialLoading && !hasActualError && (!hasMemberships || !hasActiveContext)

  // Determine if user needs onboarding
  const needsOnboarding = hasNoBusinessAccess && !hasMemberships

  // Determine if user has memberships but no active context (edge case)
  const hasInactiveMemberships = hasNoBusinessAccess && hasMemberships && !hasActiveContext

  return {
    hasMemberships,
    hasActiveContext,
    isInitialLoading,
    hasActualError,
    hasNoBusinessAccess,
    needsOnboarding,
    hasInactiveMemberships,

    // State summary
    state: isInitialLoading ? 'loading' :
           hasActualError ? 'error' :
           needsOnboarding ? 'needs_onboarding' :
           hasInactiveMemberships ? 'inactive_memberships' :
           hasActiveContext ? 'ready' : 'unknown'
  }
}

/**
 * Business profile functionality (consolidated from business-profile-context)
 */
export function useBusinessProfile() {
  const { profile, isLoadingProfile, profileError, refreshProfile, updateProfile } = useBusinessContext()

  return {
    profile,
    isLoading: isLoadingProfile,
    error: profileError,
    refetch: refreshProfile,
    updateProfile
  }
}