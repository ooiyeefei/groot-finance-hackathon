/**
 * Account Management Domain Types
 * Multi-Tenant RBAC API Contracts moved from src/types/api-contracts.ts
 */

import { TApiSuccessResponse } from '@/types/api'

// ============================================================================
// Core Business Types
// ============================================================================

export type BusinessRole = 'admin' | 'manager' | 'employee'
export type MembershipStatus = 'active' | 'suspended' | 'inactive'

/**
 * Business membership details for a specific user in a business
 */
export interface TBusinessMembership {
  id: string
  user_id: string
  business_id: string
  role: BusinessRole
  invited_at?: string
  joined_at: string
  last_accessed_at?: string
  status: MembershipStatus
  created_at: string
  updated_at: string
}

/**
 * Complete business information with user's membership details
 */
export interface TBusinessWithMembership {
  // Business properties
  id: string
  name: string
  slug: string
  owner_id: string
  country_code: string
  home_currency: string
  logo_url?: string
  logo_fallback_color: string

  // User's membership in this business
  membership: TBusinessMembership

  // Computed properties
  isOwner: boolean
}

/**
 * Permission flags for role-based access control
 */
export interface TBusinessPermissions {
  // Owner-only privileges (business-level operations)
  canDeleteBusiness: boolean
  canManageSubscription: boolean
  canTransferOwnership: boolean

  // Operational permissions (role-based within business)
  canInviteMembers: boolean
  canRemoveMembers: boolean
  canChangeSettings: boolean
  canApproveExpenses: boolean
  canManageCategories: boolean
  canViewAllData: boolean
}

/**
 * Current user's business context with computed permissions
 */
export interface TBusinessContext {
  businessId: string
  businessName: string
  role: BusinessRole
  isOwner: boolean
  permissions: TBusinessPermissions
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * GET /api/v1/account-management/businesses/memberships
 * Purpose: Retrieve all businesses the authenticated user is a member of
 */
export interface TGetBusinessMembershipsResponse extends TApiSuccessResponse<{
  memberships: TBusinessWithMembership[]
}> {
  success: true
  data: {
    memberships: TBusinessWithMembership[]
  }
}

/**
 * GET /api/v1/account-management/businesses/context
 * Purpose: Get current user's active business context with permissions
 */
export interface TGetBusinessContextResponse extends TApiSuccessResponse<{
  context: TBusinessContext | null
}> {
  success: true
  data: {
    context: TBusinessContext | null
  }
}

/**
 * POST /api/v1/account-management/businesses/switch - Request Body
 * Purpose: Switch user's active business context
 */
export interface TSwitchBusinessRequest {
  businessId: string
}

/**
 * POST /api/v1/account-management/businesses/switch - Response Body
 * Purpose: Confirm successful business switch with new context
 */
export interface TSwitchBusinessResponse extends TApiSuccessResponse<{
  context: TBusinessContext
}> {
  success: true
  data: {
    context: TBusinessContext
  }
  message?: string
}

// ============================================================================
// Frontend Utility Types
// ============================================================================

/**
 * Helper type for business switcher UI components
 */
export interface TBusinessSwitcherOption {
  id: string
  name: string
  role: BusinessRole
  isOwner: boolean
  isActive: boolean
}

/**
 * Helper type for permission-based UI rendering
 */
export interface TPermissionFlags extends TBusinessPermissions {
  // Computed convenience flags
  canManageTeam: boolean    // canInviteMembers || canRemoveMembers
  canAccessAdmin: boolean   // role === 'finance_admin' || isOwner
  canAccessManager: boolean // role === 'finance_admin' || role === 'manager' || isOwner
}

// ============================================================================
// API Client Helper Types
// ============================================================================

/**
 * Configuration for API client functions
 */
export interface TApiClientConfig {
  baseUrl?: string
  timeout?: number
  retryAttempts?: number
}

/**
 * Generic API client function signature
 */
export type TApiClientFunction<TRequest = void, TResponse = any> = (
  request: TRequest,
  config?: TApiClientConfig
) => Promise<TResponse>