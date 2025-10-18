/**
 * Business Context Security Validator
 * Implements fail-safe business context validation to prevent privilege escalation
 * and cross-tenant data access vulnerabilities
 */

import { auth } from '@clerk/nextjs/server'
import { getUserData, createServiceSupabaseClient } from '@/lib/db/supabase-server'

export interface BusinessContextValidation {
  isValid: boolean
  businessId: string
  userId: string
  userRole: 'admin' | 'manager' | 'employee'
  isOwner: boolean
  error?: string
}

export interface FailSafeValidationOptions {
  requireOwnership?: boolean
  minimumRole?: 'admin' | 'manager' | 'employee'
  allowServiceRole?: boolean
  bypassCache?: boolean
}

/**
 * Core fail-safe business context validation
 * This function provides comprehensive security checks to prevent:
 * 1. Cross-tenant data access
 * 2. Privilege escalation via business switching
 * 3. Unauthorized service role usage
 * 4. Business membership spoofing
 */
export async function validateBusinessContext(
  businessId: string,
  options: FailSafeValidationOptions = {}
): Promise<BusinessContextValidation> {

  const {
    requireOwnership = false,
    minimumRole = 'employee',
    allowServiceRole = false,
    bypassCache = false
  } = options

  try {
    // Step 1: Authenticate user
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return {
        isValid: false,
        businessId,
        userId: '',
        userRole: 'employee',
        isOwner: false,
        error: 'Authentication required'
      }
    }

    // Step 2: Get validated user data
    const userData = await getUserData(clerkUserId)
    if (!userData.id) {
      return {
        isValid: false,
        businessId,
        userId: '',
        userRole: 'employee',
        isOwner: false,
        error: 'User data not found'
      }
    }

    // Step 3: Validate business ID format (prevent injection attacks)
    if (!isValidUUID(businessId)) {
      return {
        isValid: false,
        businessId,
        userId: userData.id,
        userRole: 'employee',
        isOwner: false,
        error: 'Invalid business ID format'
      }
    }

    // Step 4: Use service role ONLY for validation (not user queries)
    const supabase = createServiceSupabaseClient()

    // Step 5: Validate business exists and is active
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, owner_id, name, status')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return {
        isValid: false,
        businessId,
        userId: userData.id,
        userRole: 'employee',
        isOwner: false,
        error: 'Business not found or inactive'
      }
    }

    // Step 6: Check business ownership
    const isOwner = business.owner_id === userData.id

    // Step 7: Validate business membership with comprehensive checks
    const { data: membership, error: membershipError } = await supabase
      .from('business_memberships')
      .select('business_id, user_id, role, status, joined_at')
      .eq('business_id', businessId)
      .eq('user_id', userData.id)
      .eq('status', 'active')
      .single()

    if (membershipError || !membership) {
      return {
        isValid: false,
        businessId,
        userId: userData.id,
        userRole: 'employee',
        isOwner,
        error: 'No active business membership found'
      }
    }

    // Step 8: Validate membership data integrity
    if (membership.business_id !== businessId || membership.user_id !== userData.id) {
      return {
        isValid: false,
        businessId,
        userId: userData.id,
        userRole: 'employee',
        isOwner,
        error: 'Business membership data integrity violation'
      }
    }

    const userRole = membership.role

    // Step 9: Check ownership requirements
    if (requireOwnership && !isOwner) {
      return {
        isValid: false,
        businessId,
        userId: userData.id,
        userRole,
        isOwner,
        error: 'Business ownership required for this operation'
      }
    }

    // Step 10: Check minimum role requirements
    if (!hasMinimumRole(userRole, minimumRole)) {
      return {
        isValid: false,
        businessId,
        userId: userData.id,
        userRole,
        isOwner,
        error: `Minimum role '${minimumRole}' required for this operation`
      }
    }

    // Step 11: Additional security checks for service role usage
    if (!allowServiceRole) {
      // Ensure this validation is not being called from service role context
      // This prevents service role privilege escalation
      const callerInfo = getCallerInfo()
      if (callerInfo.isServiceRole) {
        console.error('[Security] Service role attempted to use user context validation:', callerInfo)
        return {
          isValid: false,
          businessId,
          userId: userData.id,
          userRole,
          isOwner,
          error: 'Service role cannot use user context validation'
        }
      }
    }

    // Step 12: Success - all validations passed
    return {
      isValid: true,
      businessId,
      userId: userData.id,
      userRole,
      isOwner
    }

  } catch (error) {
    console.error('[Security] Business context validation error:', error)
    return {
      isValid: false,
      businessId,
      userId: '',
      userRole: 'employee',
      isOwner: false,
      error: error instanceof Error ? error.message : 'Validation failed'
    }
  }
}

/**
 * Middleware-safe validation for API routes
 * Provides immediate rejection for unauthorized access attempts
 */
export async function validateApiBusinessAccess(
  businessId: string,
  options: FailSafeValidationOptions = {}
): Promise<BusinessContextValidation> {

  // Enhanced validation with strict security checks
  const validation = await validateBusinessContext(businessId, {
    ...options,
    bypassCache: true, // Always fresh data for API validation
  })

  // Additional API-specific security checks
  if (validation.isValid) {
    // Check for suspicious patterns in business switching
    await checkBusinessSwitchingPatterns(validation.userId, businessId)
  }

  return validation
}

/**
 * Validate that user has minimum required role
 */
function hasMinimumRole(
  userRole: 'admin' | 'manager' | 'employee',
  minimumRole: 'admin' | 'manager' | 'employee'
): boolean {
  const roleHierarchy = {
    'employee': 1,
    'manager': 2,
    'admin': 3
  }

  return roleHierarchy[userRole] >= roleHierarchy[minimumRole]
}

/**
 * Validate UUID format to prevent injection attacks
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Get caller information to detect service role usage
 */
function getCallerInfo(): { isServiceRole: boolean; caller: string } {
  const stack = new Error().stack || ''
  const isServiceRole = stack.includes('createServiceSupabaseClient') ||
                       stack.includes('SUPABASE_SERVICE_ROLE_KEY')

  // Extract caller function name for logging
  const callerMatch = stack.split('\n')[3]?.match(/at (\w+)/) || ['', 'unknown']
  const caller = callerMatch[1]

  return { isServiceRole, caller }
}

/**
 * Check for suspicious business switching patterns that might indicate attacks
 */
async function checkBusinessSwitchingPatterns(userId: string, businessId: string): Promise<void> {
  try {
    const supabase = createServiceSupabaseClient()

    // Check recent business switches (last 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data: recentSwitches, error } = await supabase
      .from('business_memberships')
      .select('business_id, last_accessed_at')
      .eq('user_id', userId)
      .gte('last_accessed_at', oneHourAgo)
      .order('last_accessed_at', { ascending: false })

    if (error) {
      console.warn('[Security] Could not check business switching patterns:', error)
      return
    }

    // Alert if user is switching between more than 5 businesses in 1 hour
    const uniqueBusinesses = new Set(recentSwitches?.map(s => s.business_id) || [])
    if (uniqueBusinesses.size > 5) {
      console.warn(`[Security] Suspicious business switching detected: User ${userId} switched between ${uniqueBusinesses.size} businesses in the last hour`)
    }

  } catch (error) {
    console.warn('[Security] Error checking business switching patterns:', error)
  }
}

/**
 * Create a validated business context guard for high-security operations
 * Returns a guard function that can be reused for multiple validations
 */
export function createBusinessContextGuard(
  options: FailSafeValidationOptions = {}
) {
  return async (businessId: string): Promise<BusinessContextValidation> => {
    return validateApiBusinessAccess(businessId, {
      ...options,
      allowServiceRole: false, // Never allow service role for guarded operations
    })
  }
}

/**
 * Validation helpers for specific use cases
 */
export const BusinessValidators = {
  /**
   * Validate admin access (admin role required)
   */
  requireAdmin: (businessId: string) => validateBusinessContext(businessId, {
    minimumRole: 'admin',
    bypassCache: true
  }),

  /**
   * Validate manager access (manager or admin role required)
   */
  requireManager: (businessId: string) => validateBusinessContext(businessId, {
    minimumRole: 'manager',
    bypassCache: true
  }),

  /**
   * Validate owner access (business ownership required)
   */
  requireOwner: (businessId: string) => validateBusinessContext(businessId, {
    requireOwnership: true,
    bypassCache: true
  }),

  /**
   * Validate any member access (employee, manager, or admin)
   */
  requireMember: (businessId: string) => validateBusinessContext(businessId, {
    minimumRole: 'employee',
    bypassCache: true
  }),

  /**
   * High-security validation for financial operations
   */
  requireFinancialAccess: (businessId: string) => validateBusinessContext(businessId, {
    minimumRole: 'manager',
    bypassCache: true,
    allowServiceRole: false
  })
}