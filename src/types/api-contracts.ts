/**
 * Multi-Tenant RBAC API Contracts
 *
 * Official TypeScript interfaces for frontend-backend communication.
 * These contracts define the exact data structure for all business context APIs.
 *
 * @version 1.0.0
 * @date 2025-01-01
 */

// ============================================================================
// Core Business Types
// ============================================================================

export type BusinessRole = 'owner' | 'manager' | 'employee'
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
  /**
   * Flag indicating the context was auto-recovered from a deleted/orphaned business.
   * When true, client should clear local caches and refresh all data.
   */
  autoRecovered?: boolean
}

// ============================================================================
// API Response Wrappers
// ============================================================================

/**
 * Standard API success response wrapper
 */
export interface TApiSuccessResponse<T = any> {
  success: true
  data?: T
  message?: string
}

/**
 * Standard API error response wrapper
 */
export interface TApiErrorResponse {
  success: false
  error: string
  details?: string
  code?: string
}

export type TApiResponse<T = any> = TApiSuccessResponse<T> | TApiErrorResponse

// ============================================================================
// 1. GET /api/v1/account-management/businesses/memberships
// ============================================================================

/**
 * GET /api/v1/account-management/businesses/memberships
 *
 * Purpose: Retrieve all businesses the authenticated user is a member of
 * Use Case: Business switcher dropdown, user dashboard
 */
export interface TGetBusinessMembershipsResponse extends TApiSuccessResponse<{
  memberships: TBusinessWithMembership[]
}> {
  success: true
  data: {
    memberships: TBusinessWithMembership[]
  }
}

// Error response uses TApiErrorResponse

// ============================================================================
// 2. GET /api/v1/account-management/businesses/context
// ============================================================================

/**
 * GET /api/v1/account-management/businesses/context
 *
 * Purpose: Get current user's active business context with permissions
 * Use Case: Role-based UI rendering, permission checks, navigation customization
 */
export interface TGetBusinessContextResponse extends TApiSuccessResponse<{
  context: TBusinessContext | null
}> {
  success: true
  data: {
    context: TBusinessContext | null
  }
}

// Error response uses TApiErrorResponse

// ============================================================================
// 3. POST /api/v1/account-management/businesses/switch
// ============================================================================

/**
 * POST /api/v1/account-management/businesses/switch - Request Body
 *
 * Purpose: Switch user's active business context
 */
export interface TSwitchBusinessRequest {
  businessId: string
}

/**
 * POST /api/v1/account-management/businesses/switch - Response Body
 *
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

// Error response uses TApiErrorResponse with possible errors:
// - 'Authentication required'
// - 'Access denied to business'
// - 'Failed to switch business'

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
  canAccessAdmin: boolean   // role === 'owner' (only owner has admin-level access)
  canAccessManager: boolean // role === 'owner' || role === 'manager'
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

// ============================================================================
// Example Usage Documentation
// ============================================================================

/*
FRONTEND USAGE EXAMPLES:

1. Get all user's businesses:
```typescript
const response: TGetBusinessMembershipsResponse = await api.getBusinessMemberships()
if (response.success) {
  const businesses = response.data.memberships
  // Render business switcher with businesses
}
```

2. Get current business context:
```typescript
const response: TGetBusinessContextResponse = await api.getBusinessContext()
if (response.success && response.data.context) {
  const { permissions } = response.data.context
  // Show/hide UI elements based on permissions.canDeleteBusiness, etc.
}
```

3. Switch active business:
```typescript
const request: TSwitchBusinessRequest = { businessId: 'business-123' }
const response: TSwitchBusinessResponse = await api.switchBusiness(request)
if (response.success) {
  const newContext = response.data.context
  // Update UI with new business context and permissions
}
```

ERROR HANDLING:
```typescript
if (!response.success) {
  // Handle error case
  console.error(`API Error: ${response.error}`)
  if (response.details) {
    console.error(`Details: ${response.details}`)
  }
}
```
*/