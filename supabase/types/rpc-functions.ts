/**
 * Supabase RPC Function Type Definitions
 *
 * This file provides TypeScript type definitions for all RPC functions in the Supabase database.
 * Types are manually maintained to ensure accuracy and provide inline documentation.
 *
 * ⚠️ IMPORTANT: Keep this file in sync with actual database functions
 *
 * Sync Strategy:
 * - Manual updates when creating/modifying RPC functions
 * - Validated by `supabase gen types` output in src/lib/database.types.ts
 * - Cross-reference with /supabase/CLAUDE.md for function documentation
 *
 * Last Updated: 2025-01-23
 */

// =============================================================================
// Security Functions (Used by RLS Policies)
// =============================================================================

/**
 * get_jwt_claim - Extract claim from JWT token
 *
 * **Purpose**: Extracts claims from the authenticated user's JWT token
 *
 * **Usage**: Called by RLS policies and get_user_business_id()
 *
 * **Security**: SECURITY DEFINER, STABLE
 *
 * **Critical**: DO NOT DELETE - Required by all RLS policies
 *
 * @param claim_name - Name of JWT claim to extract (e.g., 'sub' for user ID)
 * @returns The claim value as text, or null if not found
 *
 * @example
 * // SQL Usage in RLS Policy
 * WHERE user_id = get_jwt_claim('sub')::uuid
 */
export type GetJwtClaimFunction = {
  Args: { claim_name: string }
  Returns: string | null
}

/**
 * get_user_business_id - Get user's active business ID
 *
 * **Purpose**: Returns the authenticated user's active business_id for RLS filtering
 *
 * **Usage**: Used by 14+ RLS policies across core tables
 *
 * **Security**: SECURITY DEFINER, STABLE
 *
 * **Critical**: DO NOT DELETE - Deleting breaks all multi-tenant security
 *
 * **Tables Using This Function**:
 * - users, business_memberships, conversations, messages
 * - expense_claims, audit_events, accounting_entries
 * - invoices, vendors, applications, line_items
 * - businesses, application_documents, expense_categories
 *
 * @returns UUID of user's active business, or null if not found
 *
 * @example
 * // SQL Usage in RLS Policy
 * CREATE POLICY "business_isolation"
 * ON expense_claims
 * USING (business_id = get_user_business_id())
 */
export type GetUserBusinessIdFunction = {
  Args: Record<string, never>  // No parameters
  Returns: string | null        // uuid as string
}

/**
 * get_active_business_context - Get full business context for user
 *
 * **Purpose**: Returns complete business context including role and ownership
 *
 * **Status**: ⚠️ NOT CURRENTLY USED - TypeScript code uses direct queries instead
 *
 * **Replacement**: src/lib/db/business-context.ts → getCurrentBusinessContext()
 *
 * **Potentially Removable**: Not referenced in RLS policies or TypeScript code
 *
 * @param p_clerk_user_id - Clerk user ID from JWT
 * @returns Table with business_id, business_name, role, is_owner, user_id
 *
 * @deprecated Consider removing - replaced by TypeScript implementation
 */
export type GetActiveBusinessContextFunction = {
  Args: { p_clerk_user_id: string }
  Returns: {
    business_id: string
    business_name: string
    role: 'employee' | 'manager' | 'admin'
    is_owner: boolean
    user_id: string
  }[]
}

// =============================================================================
// Business Logic Functions (Called from TypeScript)
// =============================================================================

/**
 * create_accounting_entry_from_approved_claim - Create accounting entry atomically
 *
 * **Purpose**: Atomically creates accounting_entries and line_items when expense claim approved
 *
 * **Called From**: src/domains/expense-claims/lib/data-access.ts:963
 *
 * **Business Logic**:
 * 1. Reads expense_claims.processing_metadata.financial_data
 * 2. Creates accounting_entries record
 * 3. Creates line_items records (if present)
 * 4. Updates expense_claims.accounting_entry_id
 * 5. All operations in atomic transaction
 *
 * **Why RPC**:
 * - Atomicity: All operations succeed or all fail
 * - Performance: Single round-trip to database
 * - Consistency: Server-side category mapping
 * - Audit Trail: Database-level logging
 *
 * @param p_claim_id - Expense claim UUID to approve
 * @param p_approver_id - User UUID who approved the claim
 * @returns UUID of created accounting_entries record
 * @throws Error if claim not found or metadata invalid
 *
 * @example
 * const { data: transactionId, error } = await supabase.rpc(
 *   'create_accounting_entry_from_approved_claim',
 *   {
 *     p_claim_id: 'claim-uuid',
 *     p_approver_id: 'user-uuid'
 *   }
 * )
 */
export type CreateAccountingEntryFromApprovedClaimFunction = {
  Args: {
    p_claim_id: string      // uuid
    p_approver_id: string   // uuid
  }
  Returns: string           // uuid of created accounting_entry
}

/**
 * get_invoices_with_linked_transactions - Fetch invoices with transaction data
 *
 * **Purpose**: Returns invoices with linked accounting entries in single optimized query
 *
 * **Called From**: src/domains/invoices/lib/data-access.ts:103
 *
 * **Why RPC**:
 * - Performance: Optimized JOINs with proper indexing
 * - Complex Logic: Custom aggregations and transformations
 * - Consistency: Server-side business rules
 *
 * @param p_business_id - Business UUID to filter invoices
 * @returns Array of invoice records with linked transaction data
 *
 * @example
 * const { data, error } = await supabase.rpc(
 *   'get_invoices_with_linked_transactions',
 *   { p_business_id: businessId }
 * )
 */
export type GetInvoicesWithLinkedTransactionsFunction = {
  Args: {
    p_business_id: string  // uuid
  }
  Returns: Array<{
    // Invoice fields
    id: string
    document_type: string
    status: string
    vendor_name: string | null
    total_amount: number | null
    currency: string | null
    transaction_date: string | null
    // Linked transaction fields
    transaction_id: string | null
    accounting_entry_id: string | null
    // Additional fields from JOIN
    [key: string]: any
  }>
}

/**
 * get_manager_team_employees - Get employees reporting to manager
 *
 * **Purpose**: Returns all employees in manager's team via hierarchy
 *
 * **Called From**: src/domains/users/lib/user.service.ts:152
 *
 * **Business Logic**:
 * - Traverses business_memberships.manager_id hierarchy
 * - Filters by active status
 * - Includes direct reports and indirect reports
 *
 * @param p_manager_id - Manager user UUID
 * @param p_business_id - Business UUID for filtering
 * @returns Array of employee records with membership details
 *
 * @example
 * const { data, error } = await supabase.rpc(
 *   'get_manager_team_employees',
 *   {
 *     p_manager_id: managerId,
 *     p_business_id: businessId
 *   }
 * )
 */
export type GetManagerTeamEmployeesFunction = {
  Args: {
    p_manager_id: string   // uuid
    p_business_id: string  // uuid
  }
  Returns: Array<{
    user_id: string
    full_name: string | null
    email: string
    role: 'employee' | 'manager' | 'admin'
    status: 'active' | 'inactive' | 'suspended'
    manager_id: string | null
    department: string | null
    // Additional fields from business_memberships
    [key: string]: any
  }>
}

/**
 * get_dashboard_analytics - Get aggregated analytics for dashboard
 *
 * **Purpose**: Returns complex aggregations for dashboard metrics
 *
 * **Called From**: src/domains/analytics/lib/engine.ts:130
 *
 * **Why RPC**:
 * - Performance: Complex aggregations run server-side
 * - Consistency: Single source of truth for calculations
 * - Optimization: Database-specific optimizations
 *
 * @param p_business_id - Business UUID
 * @param p_user_id - User UUID for scoping
 * @param p_scope - Data scope: 'personal' | 'team' | 'company'
 * @returns JSON object with aggregated metrics
 *
 * @example
 * const { data, error } = await supabase.rpc(
 *   'get_dashboard_analytics',
 *   {
 *     p_business_id: businessId,
 *     p_user_id: userId,
 *     p_scope: 'company'
 *   }
 * )
 */
export type GetDashboardAnalyticsFunction = {
  Args: {
    p_business_id: string  // uuid
    p_user_id: string      // uuid
    p_scope: 'personal' | 'team' | 'company'
  }
  Returns: {
    total_revenue: number
    total_expenses: number
    net_income: number
    expense_by_category: Array<{
      category: string
      total_amount: number
      percentage: number
    }>
    monthly_trends: Array<{
      month: string
      revenue: number
      expenses: number
    }>
    pending_approvals: number
    recent_transactions: Array<{
      id: string
      description: string
      amount: number
      date: string
    }>
    // Additional analytics fields
    [key: string]: any
  }
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * RPC Function Registry
 *
 * Complete mapping of all RPC functions for type-safe calls
 */
export interface RPCFunctions {
  // Security Functions
  get_jwt_claim: GetJwtClaimFunction
  get_user_business_id: GetUserBusinessIdFunction
  get_active_business_context: GetActiveBusinessContextFunction

  // Business Logic Functions
  create_accounting_entry_from_approved_claim: CreateAccountingEntryFromApprovedClaimFunction
  get_invoices_with_linked_transactions: GetInvoicesWithLinkedTransactionsFunction
  get_manager_team_employees: GetManagerTeamEmployeesFunction
  get_dashboard_analytics: GetDashboardAnalyticsFunction
}

/**
 * Type-safe RPC function caller
 *
 * Ensures correct parameters and return types for RPC calls
 *
 * @example
 * // Type-safe RPC call
 * const result = await callRPC(supabase, 'get_user_business_id', {})
 * //    ^? result is string | null
 *
 * // TypeScript error on wrong parameters
 * const result = await callRPC(supabase, 'get_manager_team_employees', {
 *   p_manager_id: 123  // ❌ Error: number is not assignable to string
 * })
 */
export type CallRPC<T extends keyof RPCFunctions> = {
  (
    supabase: any,
    functionName: T,
    args: RPCFunctions[T]['Args']
  ): Promise<{ data: RPCFunctions[T]['Returns']; error: any }>
}

// =============================================================================
// Usage Examples
// =============================================================================

/**
 * Example: Type-safe RPC calls
 */
/*

import { createClient } from '@supabase/supabase-js'
import type { RPCFunctions } from '@/supabase/types/rpc-functions'

const supabase = createClient(url, key)

// ✅ Type-safe call with autocomplete
const { data: transactionId, error } = await supabase.rpc<
  RPCFunctions['create_accounting_entry_from_approved_claim']['Returns']
>(
  'create_accounting_entry_from_approved_claim',
  {
    p_claim_id: claimId,        // ✅ Correct type
    p_approver_id: approverId   // ✅ Correct type
  }
)

// ❌ TypeScript error - wrong parameter type
const { data } = await supabase.rpc(
  'create_accounting_entry_from_approved_claim',
  {
    p_claim_id: 123,  // ❌ Error: number not assignable to string
  }
)

// ✅ Type-safe return value
if (transactionId) {
  const id: string = transactionId  // ✅ Correctly typed as string
}

*/

// =============================================================================
// Maintenance Notes
// =============================================================================

/**
 * Keeping Types in Sync
 *
 * 1. **After Creating RPC Function**:
 *    - Add function to migration file
 *    - Add type definition to this file
 *    - Add documentation to /supabase/CLAUDE.md
 *    - Run `npm run update-types` to generate Database types
 *
 * 2. **After Modifying RPC Function**:
 *    - Update migration file or create new migration
 *    - Update type definition in this file
 *    - Update documentation in /supabase/CLAUDE.md
 *    - Run `npm run update-types`
 *
 * 3. **Before Deleting RPC Function**:
 *    - Search codebase for `.rpc('function_name'`
 *    - Check /supabase/CLAUDE.md for RLS policy usage
 *    - Remove type definition from this file
 *    - Update documentation
 *
 * 4. **Verification**:
 *    - Run `npm run build` to catch type errors
 *    - Check generated types in src/lib/database.types.ts
 *    - Test RPC calls in development environment
 */
