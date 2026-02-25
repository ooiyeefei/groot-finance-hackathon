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

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
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
import { prefetchUserRole, clearAllAppCaches } from '@/lib/cache-utils'
import { clearCurrencyCache } from '@/domains/users/hooks/use-home-currency'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('BusinessContext')

// ============================================================================
// Context Types
// ============================================================================

interface BusinessProfile {
  id: string
  name: string
  logo_url?: string
  logo_fallback_color?: string
  home_currency?: string
  address?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  // e-inv-ui-forms: LHDN compliance fields
  lhdn_tin?: string | null
  business_registration_number?: string | null
  msic_code?: string | null
  msic_description?: string | null
  sst_registration_number?: string | null
  lhdn_client_id?: string | null
  peppol_participant_id?: string | null
  // e-inv-ui-forms: Structured address
  address_line1?: string | null
  address_line2?: string | null
  address_line3?: string | null
  city?: string | null
  state_code?: string | null
  postal_code?: string | null
  country_code?: string | null
  // LHDN self-bill auto-trigger
  auto_self_bill_exempt_vendors?: boolean
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
        log.warn(' Failed to parse cached business profile:', error)
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

  // Track if we've already started initial loading to prevent duplicate API calls
  const [hasStartedInitialLoad, setHasStartedInitialLoad] = useState(false)

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
      } else {
        // Handle error response
        const errorMsg = ('error' in response ? response.error : 'Failed to load business memberships') as string
        setMembershipsError(errorMsg)
        log.error(' Error loading memberships:', errorMsg)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error loading memberships'

      // For genuinely new users (no Convex record), this is expected
      if (errorMsg.includes('User not found')) {
        setMemberships([])
        setMembershipsError(null) // Clear error for new users
      } else if (errorMsg.includes('500')) {
        // Server errors are transient — keep error state set to prevent
        // the auto-redirect logic from treating this as "user has no memberships"
        setMemberships([])
        setMembershipsError('transient_server_error')
        log.warn(' Server error loading memberships (transient, will not redirect):', errorMsg)
      } else {
        setMembershipsError(errorMsg)
        log.error(' Exception loading memberships:', error)
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
        const context = response.data.context

        // AUTO-RECOVERY DETECTION: If server switched to a different business due to
        // the user's previous business being deleted/orphaned, clear all local caches
        // and force a full page refresh to ensure all data is consistent
        if (context?.autoRecovered) {
          log.debug(' 🔄 AUTO-RECOVERY detected - clearing caches and refreshing page')

          // Clear all business-related localStorage caches
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem('business-profile')
              localStorage.removeItem('user-role-cache')
              log.debug(' ✅ Cleared local storage caches')
            } catch (cacheError) {
              log.warn(' Failed to clear localStorage:', cacheError)
            }
          }

          // Force page refresh to ensure all components get fresh data
          // This is the cleanest way to ensure complete state consistency
          window.location.reload()
          return // Don't continue after reload
        }

        setActiveContext(context)
      } else {
        // Handle error response
        const errorMsg = ('error' in response ? response.error : 'Failed to load business context') as string
        setContextError(errorMsg)
        log.error(' Error loading context:', errorMsg)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error loading context'

      // For genuinely new users (no Convex record), this is expected
      if (errorMsg.includes('User not found')) {
        setActiveContext(null)
        setContextError(null) // Clear error for new users
      } else if (errorMsg.includes('500')) {
        // Server errors are transient — keep error state set to prevent
        // the auto-redirect logic from treating this as "user has no context"
        setActiveContext(null)
        setContextError('transient_server_error')
        log.warn(' Server error loading context (transient, will not redirect):', errorMsg)
      } else {
        setContextError(errorMsg)
        log.error(' Exception loading context:', error)
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
            log.warn(' Failed to cache business profile:', error)
          }
        }
      } else {
        const errorMsg = result.error || 'Failed to fetch business profile'

        // For new users, "No business associated with user" is expected - don't treat as error
        if (errorMsg.includes('No business associated with user')) {
          setProfile(null)
          setProfileError(null) // Clear error for new users
        } else {
          setProfileError(errorMsg)
          log.error(' Error loading profile:', errorMsg)
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error loading profile'

      // For new users, network errors when fetching profile are expected - don't treat as critical error
      if (errorMsg.includes('No business associated with user') || errorMsg.includes('500')) {
        setProfile(null)
        setProfileError(null) // Clear error for new users
      } else {
        setProfileError(errorMsg)
        log.error(' Exception loading profile:', error)
      }
    } finally {
      setIsLoadingProfile(false)
    }
  }, [])

  const switchActiveBusiness = useCallback(async (businessId: string): Promise<boolean> => {
    setIsSwitching(true)
    setSwitchError(null)

    try {
      const request: TSwitchBusinessRequest = { businessId }
      const response = await switchBusiness(request)

      if (response.success) {
        // Update active context immediately
        setActiveContext(response.data.context)

        // Refresh memberships to update last_accessed_at
        await refreshMemberships()

        // NOTE: Do NOT call refreshProfile() here!
        // The useEffect hook will automatically handle profile refresh
        // when activeContext changes and detects a mismatch with cached profile.
        // Calling it here causes duplicate/racing API calls leading to 429 errors.

        return true
      } else {
        // Handle error response
        const errorMsg = ('error' in response ? response.error : 'Failed to switch business') as string
        setSwitchError(errorMsg)
        log.error(' Error switching business:', errorMsg)
        return false
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error switching business'
      setSwitchError(errorMsg)
      log.error(' Exception switching business:', error)
      return false
    } finally {
      setIsSwitching(false)
    }
  }, [refreshMemberships])

  const updateProfile = useCallback((updatedProfile: BusinessProfile) => {
    setProfile(updatedProfile)

    // Update cache when profile is updated
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('business-profile', JSON.stringify(updatedProfile))
      } catch (error) {
        log.warn(' Failed to update cached business profile:', error)
      }
    }

    // CRITICAL FIX: If business name changed, also refresh the active context
    // This ensures sidebar and profile stay in sync when name is updated via settings
    if (activeContext && activeContext.businessName !== updatedProfile.name) {
      refreshContext()
    }
  }, [activeContext, refreshContext])

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

  // USER CHANGE DETECTION: Clear all caches when user identity changes
  // Handles: sign-out (userId → null), sign-in as different user (userId A → userId B)
  const prevUserIdRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!isAuthLoaded) return

    const prevUserId = prevUserIdRef.current

    // First render after auth loads — just record the userId
    if (prevUserId === undefined) {
      prevUserIdRef.current = userId ?? null
      return
    }

    const currentUserId = userId ?? null

    // Detect user change (sign-out or different user signed in)
    if (prevUserId !== null && prevUserId !== currentUserId) {
      log.debug('User identity changed, clearing all caches', {
        from: prevUserId,
        to: currentUserId,
      })
      clearAllAppCaches()
      clearCurrencyCache()

      // Reset in-memory state so stale data isn't served to the new user
      setMemberships([])
      setActiveContext(null)
      setProfile(null)
      setHasCompletedInitialLoad(false)
      setHasStartedInitialLoad(false)
    }

    prevUserIdRef.current = currentUserId
  }, [isAuthLoaded, userId])

  // ULTRA-EARLY PREFETCH: Start role prefetching as soon as Clerk is ready
  useEffect(() => {
    if (isAuthLoaded && isSignedIn && userId) {
      // Start prefetching immediately, don't wait for business context initialization
      prefetchUserRole().catch(error => {
        log.warn(' Ultra-early role prefetch failed:', error)
      })
    }
  }, [isAuthLoaded, isSignedIn, userId])

  // Initial data loading - only when authenticated
  useEffect(() => {
    // Only load data if Clerk is loaded and user is signed in
    if (!isAuthLoaded || !isSignedIn || !userId) {
      return
    }

    // Prevent duplicate initialization due to Clerk auth state changes
    if (hasStartedInitialLoad) {
      log.debug(' Initial load already started, skipping duplicate initialization')
      return
    }

    log.debug(' Initializing business context for authenticated user')
    setHasStartedInitialLoad(true)

    // PERFORMANCE: Start prefetching user roles early (parallel to business context loading)
    prefetchUserRole().catch(error => {
      log.warn(' Early role prefetch failed:', error)
    })

    // PERFORMANCE OPTIMIZATION: Parallel data loading with Promise.allSettled
    // This loads all data simultaneously instead of sequentially (3x faster)
    const loadData = async () => {
      try {
        log.debug(' 🚀 Starting parallel data load...')

        // Execute all API calls in parallel using Promise.allSettled
        // This provides resilience - if one fails, others still succeed
        const [membershipsResult, contextResult, profileResult] = await Promise.allSettled([
          refreshMemberships(),
          refreshContext(),
          refreshProfile()
        ])

        // Handle memberships result
        if (membershipsResult.status === 'fulfilled') {
          log.debug(' ✅ Memberships loaded successfully')
        } else {
          log.error(' ❌ Memberships failed:', membershipsResult.reason)
          // Keep error state set to prevent false "no memberships" redirect
          setMemberships([])
          setMembershipsError('transient_load_error')
        }

        // Handle context result
        if (contextResult.status === 'fulfilled') {
          log.debug(' ✅ Business context loaded successfully')
        } else {
          log.error(' ❌ Business context failed:', contextResult.reason)
          // Keep error state set to prevent false redirect
          setActiveContext(null)
          setContextError('transient_load_error')
        }

        // Handle profile result
        if (profileResult.status === 'fulfilled') {
          log.debug(' ✅ Business profile loaded successfully')
        } else {
          log.error(' ❌ Business profile failed:', profileResult.reason)
          // For new users, this is expected
          setProfile(null)
          setProfileError(null)
          setIsLoadingProfile(false)
        }

        log.debug(' ✅ Parallel data load complete')
        setHasCompletedInitialLoad(true)
      } catch (error) {
        log.error(' 💥 Critical error during parallel data load:', error)
        // Reset the flag on error so it can retry
        setHasStartedInitialLoad(false)
      }
    }

    loadData()
  }, [isAuthLoaded, isSignedIn, userId, hasStartedInitialLoad, refreshMemberships, refreshContext, refreshProfile])

  // Auto-switch and redirect logic
  useEffect(() => {
    // Don't run if still loading data or already switching
    if (isLoadingMemberships || isLoadingContext || isSwitching || !isAuthLoaded || !isSignedIn) {
      return
    }

    // CRITICAL: Don't run redirect logic until initial data load is complete
    // This prevents false "no memberships" detection during the loading phase
    if (!hasCompletedInitialLoad) {
      log.debug(' 🔄 Waiting for initial data load to complete...', {
        hasCompletedInitialLoad,
        membershipsLength: memberships?.length,
        hasActiveContext: !!activeContext
      })
      return
    }

    const hasMemberships = memberships && memberships.length > 0
    const hasNoActiveContext = activeContext === null

    if (hasMemberships && hasNoActiveContext) {
      // Case 1: User has memberships but no active context (needs auto-switch)
      log.debug(' Auto-switch detected: User has memberships but no active context')

      // Find the most recently accessed business (memberships are ordered by last_accessed_at DESC)
      const mostRecentBusiness = memberships[0]

      if (mostRecentBusiness) {
        log.debug(' Auto-switching to most recent business:', mostRecentBusiness.name)

        // Auto-switch to the most recently accessed business
        switchActiveBusiness(mostRecentBusiness.id).then((success) => {
          if (success) {
            log.debug(' Auto-switch successful:', mostRecentBusiness.name)
          } else {
            log.error(' Auto-switch failed for business:', mostRecentBusiness.id)
          }
        }).catch((error) => {
          log.error(' Auto-switch error:', error)
        })
      }
    } else if (!hasMemberships && hasNoActiveContext && !membershipsError) {
      // Case 2: User has NO memberships and NO context (could be stale JWT or truly new user)
      log.debug(' ⚠️ No memberships detected, but checking conditions first...', {
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
        log.debug(' 📍 No business context detected - direct redirect to onboarding')
        proceedToOnboarding()
      } else {
        log.debug(' ✋ Already on onboarding or non-dashboard page, no action needed')
      }

      function proceedToOnboarding() {
        log.debug(' 📍 Proceeding with onboarding redirect (confirmed no business)', {
          isOnOnboardingPage,
          isOnDashboardPage
        })

        // Don't redirect if already on onboarding page (prevents infinite loop)
        if (!isOnOnboardingPage) {
          // Redirect to business onboarding
          const locale = window.location.pathname.match(/^\/(en|th|id|zh)/)?.[1] || 'en'
          const onboardingUrl = `/${locale}/onboarding/business`

          log.debug('Redirecting to onboarding', { onboardingUrl })
          window.location.href = onboardingUrl
        } else {
          log.debug(' ✋ Already on onboarding page, skipping redirect')
        }
      }
    }
  }, [memberships, activeContext, isLoadingMemberships, isLoadingContext, isSwitching, isAuthLoaded, isSignedIn, membershipsError, switchActiveBusiness, hasCompletedInitialLoad])

  // REF-BASED BUSINESS SWITCH TRACKING
  // Using a ref to track previous business ID avoids race conditions that occur
  // when using state-based mismatch detection (which can fire multiple times
  // before React processes state updates)
  const prevBusinessIdRef = useRef<string | undefined>(undefined)

  // Load business profile when active context becomes available or business changes
  useEffect(() => {
    const currentBusinessId = activeContext?.businessId

    // BUSINESS SWITCH DETECTION: Compare current vs previous business ID
    // This is more reliable than name mismatch detection because refs update synchronously
    if (prevBusinessIdRef.current !== undefined &&
        currentBusinessId !== undefined &&
        prevBusinessIdRef.current !== currentBusinessId) {
      log.debug('Business switch detected via ref', {
        from: prevBusinessIdRef.current,
        to: currentBusinessId
      })

      // Clear stale localStorage cache
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('business-profile')
        } catch (error) {
          log.warn(' Failed to clear business-profile cache:', error)
        }
      }

      // Clear profile state - the next condition will handle loading
      setProfile(null)
    }

    // Update ref SYNCHRONOUSLY (no race condition)
    prevBusinessIdRef.current = currentBusinessId

    // Load profile if we have active context and no profile loaded
    if (activeContext && !isLoadingProfile && !profile) {
      log.debug(' Active context available, loading business profile...')
      refreshProfile()
    }
  }, [activeContext, isLoadingProfile, profile, refreshProfile])

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

    // Role-based convenience checks (owner replaces admin)
    isAdmin: activeContext?.role === 'owner',  // owner has admin-level permissions
    isManager: activeContext?.role === 'manager' || activeContext?.role === 'owner',
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