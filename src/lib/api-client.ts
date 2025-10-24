/**
 * Multi-Tenant RBAC API Client
 *
 * Type-safe API client functions for business context management.
 * Provides consistent error handling and request/response patterns.
 *
 * @version 1.0.0
 * @date 2025-01-01
 */

import {
  TGetBusinessMembershipsResponse,
  TGetBusinessContextResponse,
  TSwitchBusinessRequest,
  TSwitchBusinessResponse,
  TApiErrorResponse,
  TBusinessPermissions
} from '@/types/api-contracts'

// ============================================================================
// API Client Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3
}

// CSRF token cache
let csrfToken: string | null = null
let csrfTokenExpires: number = 0

/**
 * Fetch CSRF token from the server
 */
async function fetchCSRFToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/v1/utils/security/csrf-token', {
      method: 'GET',
      credentials: 'same-origin'
    })

    if (!response.ok) {
      console.error('[API Client] Failed to fetch CSRF token:', response.status)
      return null
    }

    const data = await response.json()
    if (data.success && data.data && data.data.csrfToken) {
      csrfToken = data.data.csrfToken
      csrfTokenExpires = Date.now() + (60 * 60 * 1000) - 60000 // 1 hour minus 1 min buffer
      console.log('[API Client] CSRF token obtained successfully')
      return data.data.csrfToken
    }

    console.error('[API Client] Invalid CSRF token response:', data)
    return null
  } catch (error) {
    console.error('[API Client] Error fetching CSRF token:', error)
    return null
  }
}

/**
 * Get valid CSRF token (fetch new if expired)
 */
async function getCSRFToken(): Promise<string | null> {
  // Return cached token if still valid
  if (csrfToken && Date.now() < csrfTokenExpires) {
    return csrfToken
  }

  // Fetch new token
  return await fetchCSRFToken()
}

/**
 * Base fetch wrapper with CSRF protection and error handling
 */
async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  // Safely merge existing headers
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(options.headers)) {
      // Handle array format [['key', 'value'], ...]
      options.headers.forEach(([key, value]) => {
        headers[key] = value
      })
    } else {
      // Handle object format { 'key': 'value' }
      Object.entries(options.headers).forEach(([key, value]) => {
        if (typeof value === 'string') {
          headers[key] = value
        }
      })
    }
  }

  // Add CSRF token for state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method || 'GET')) {
    const token = await getCSRFToken()
    if (token) {
      headers['X-CSRF-Token'] = token
      console.log('[API Client] Adding CSRF token to request')
    } else {
      console.warn('[API Client] Could not obtain CSRF token for request')
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin' // Include cookies for authentication
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
  }

  return response.json()
}

// ============================================================================
// 1. GET /api/v1/businesses/memberships
// ============================================================================

/**
 * Get all businesses the current user is a member of
 *
 * @returns Promise<TGetBusinessMembershipsResponse>
 * @throws Error if request fails or user is not authenticated
 *
 * @example
 * ```typescript
 * try {
 *   const response = await getBusinessMemberships()
 *   if (response.success) {
 *     const businesses = response.data.memberships
 *     // Populate business switcher dropdown
 *   }
 * } catch (error) {
 *   console.error('Failed to fetch businesses:', error)
 * }
 * ```
 */
export async function getBusinessMemberships(): Promise<TGetBusinessMembershipsResponse> {
  return apiFetch<TGetBusinessMembershipsResponse>('/api/v1/account-management/businesses', {
    method: 'GET'
  })
}

// ============================================================================
// 2. GET /api/v1/businesses/context
// ============================================================================

/**
 * Get current user's active business context with permissions
 *
 * @returns Promise<TGetBusinessContextResponse>
 * @throws Error if request fails or no active business context
 *
 * @example
 * ```typescript
 * try {
 *   const response = await getBusinessContext()
 *   if (response.success && response.data.context) {
 *     const { businessName, role, permissions } = response.data.context
 *
 *     // Update UI based on permissions
 *     if (permissions.canDeleteBusiness) {
 *       showDeleteBusinessButton()
 *     }
 *
 *     if (permissions.canInviteMembers) {
 *       showInviteMembersButton()
 *     }
 *   } else {
 *     // No active business - redirect to business selection
 *     redirectToBusinessSelection()
 *   }
 * } catch (error) {
 *   console.error('Failed to fetch business context:', error)
 * }
 * ```
 */
export async function getBusinessContext(): Promise<TGetBusinessContextResponse> {
  return apiFetch<TGetBusinessContextResponse>('/api/v1/account-management/businesses/context', {
    method: 'GET'
  })
}

// ============================================================================
// 3. POST /api/v1/businesses/switch
// ============================================================================

/**
 * Switch user's active business context
 *
 * @param request - The business switch request containing target business ID
 * @returns Promise<TSwitchBusinessResponse>
 * @throws Error if switch fails (access denied, business not found, etc.)
 *
 * @example
 * ```typescript
 * try {
 *   const response = await switchBusiness({ businessId: 'business-123' })
 *   if (response.success) {
 *     const newContext = response.data.context
 *
 *     // Update global state with new context
 *     updateGlobalBusinessContext(newContext)
 *
 *     // Refresh current page data with new business context
 *     window.location.reload() // or trigger data refetch
 *
 *     // Show success notification
 *     showNotification(`Switched to ${newContext.businessName}`)
 *   }
 * } catch (error) {
 *   console.error('Failed to switch business:', error)
 *   showErrorNotification('Unable to switch business. Please try again.')
 * }
 * ```
 */
export async function switchBusiness(
  request: TSwitchBusinessRequest
): Promise<TSwitchBusinessResponse> {
  return apiFetch<TSwitchBusinessResponse>('/api/v1/account-management/businesses/switch', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if user has specific permission in current business
 *
 * @param permission - The permission to check
 * @returns Promise<boolean>
 *
 * @example
 * ```typescript
 * const canDelete = await hasPermission('canDeleteBusiness')
 * if (canDelete) {
 *   showDeleteButton()
 * }
 * ```
 */
export async function hasPermission(
  permission: keyof TBusinessPermissions
): Promise<boolean> {
  try {
    const response = await getBusinessContext()
    return response.success &&
           response.data.context?.permissions[permission] === true
  } catch {
    return false
  }
}

/**
 * Get current business ID, or null if no active business
 *
 * @returns Promise<string | null>
 *
 * @example
 * ```typescript
 * const businessId = await getCurrentBusinessId()
 * if (businessId) {
 *   fetchBusinessData(businessId)
 * } else {
 *   redirectToBusinessSelection()
 * }
 * ```
 */
export async function getCurrentBusinessId(): Promise<string | null> {
  try {
    const response = await getBusinessContext()
    return response.success ? response.data.context?.businessId || null : null
  } catch {
    return null
  }
}

/**
 * Check if user is owner of current business
 *
 * @returns Promise<boolean>
 *
 * @example
 * ```typescript
 * const isOwner = await isCurrentBusinessOwner()
 * if (isOwner) {
 *   showOwnerSettings()
 * }
 * ```
 */
export async function isCurrentBusinessOwner(): Promise<boolean> {
  try {
    const response = await getBusinessContext()
    return response.success &&
           response.data.context?.isOwner === true
  } catch {
    return false
  }
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Type guard to check if response is an error
 */
export function isApiError(response: any): response is TApiErrorResponse {
  return response && response.success === false && typeof response.error === 'string'
}

/**
 * Extract user-friendly error message from API response
 */
export function getErrorMessage(response: any): string {
  if (isApiError(response)) {
    return response.error
  }
  return 'An unexpected error occurred'
}

// ============================================================================
// React Hook Integration Example
// ============================================================================

/*
REACT HOOKS INTEGRATION EXAMPLE:

```typescript
// useBusinessContext.ts
import { useQuery } from '@tanstack/react-query'
import { getBusinessContext } from '@/lib/api-client'

export function useBusinessContext() {
  return useQuery({
    queryKey: ['business-context'],
    queryFn: getBusinessContext,
    select: (data) => data.success ? data.data.context : null,
    retry: 3,
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}

// useBusinessMemberships.ts
import { useQuery } from '@tanstack/react-query'
import { getBusinessMemberships } from '@/lib/api-client'

export function useBusinessMemberships() {
  return useQuery({
    queryKey: ['business-memberships'],
    queryFn: getBusinessMemberships,
    select: (data) => data.success ? data.data.memberships : [],
    staleTime: 10 * 60 * 1000 // 10 minutes
  })
}

// useBusinessSwitcher.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { switchBusiness } from '@/lib/api-client'

export function useBusinessSwitcher() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: switchBusiness,
    onSuccess: () => {
      // Invalidate and refetch business context
      queryClient.invalidateQueries({ queryKey: ['business-context'] })
      // Optionally invalidate other business-specific data
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    }
  })
}
```

COMPONENT USAGE:

```typescript
// BusinessSwitcher.tsx
export function BusinessSwitcher() {
  const { data: memberships } = useBusinessMemberships()
  const { data: currentContext } = useBusinessContext()
  const switchMutation = useBusinessSwitcher()

  const handleSwitch = (businessId: string) => {
    switchMutation.mutate({ businessId })
  }

  return (
    <Select onValueChange={handleSwitch}>
      {memberships?.map(business => (
        <SelectItem key={business.id} value={business.id}>
          {business.name} ({business.membership.role})
        </SelectItem>
      ))}
    </Select>
  )
}
```
*/