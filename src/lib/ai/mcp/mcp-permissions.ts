/**
 * MCP Tool Permissions Service (T072)
 *
 * Controls per-user access to MCP tools based on:
 * - Subscription plan (trial, starter, pro, enterprise)
 * - User role (owner, admin, manager, employee)
 * - Tool sensitivity level (public, internal, restricted)
 *
 * Security Principle: Deny by default, explicit allow list
 */

import { UserContext } from '../tools/base-tool'

/**
 * Tool access levels
 * - public: Available to all authenticated users
 * - internal: Available to paid plans (starter+)
 * - restricted: Available to pro+ or specific roles
 */
export type ToolAccessLevel = 'public' | 'internal' | 'restricted'

/**
 * Subscription plan types (matches catalog.ts PlanKey)
 */
export type PlanKey = 'trial' | 'starter' | 'pro' | 'enterprise'

/**
 * User roles in the business (matches RLS roles)
 */
export type UserRole = 'owner' | 'admin' | 'manager' | 'employee'

/**
 * MCP Server permission configuration
 * Defines which plans/roles can access tools from each MCP server
 */
export interface McpServerPermission {
  /** MCP Server ID */
  serverId: string
  /** Minimum plan required (ordered: trial < starter < pro < enterprise) */
  minPlan: PlanKey
  /** Roles allowed to use this server (empty = all roles) */
  allowedRoles: UserRole[]
  /** Access level for this server's tools */
  accessLevel: ToolAccessLevel
  /** Optional: Specific tools within the server that have different permissions */
  toolOverrides?: Record<string, {
    minPlan: PlanKey
    allowedRoles: UserRole[]
  }>
}

/**
 * Default MCP Server Permissions Configuration
 *
 * This configuration follows principle of least privilege:
 * - Context7 (docs): Public - useful for all users
 * - Supabase (internal operations): Internal - requires paid plan
 * - Groot Finance Intelligence: Restricted - pro+ for advanced analytics
 */
const MCP_SERVER_PERMISSIONS: McpServerPermission[] = [
  {
    serverId: 'context7',
    minPlan: 'trial',
    allowedRoles: [], // All roles
    accessLevel: 'public'
  },
  {
    serverId: 'supabase',
    minPlan: 'starter',
    allowedRoles: ['owner', 'admin', 'manager'], // Not employees
    accessLevel: 'internal',
    toolOverrides: {
      // Database mutation tools require higher permissions
      'execute_sql': { minPlan: 'pro', allowedRoles: ['owner', 'admin'] },
      'apply_migration': { minPlan: 'enterprise', allowedRoles: ['owner'] }
    }
  },
  {
    serverId: 'finanseal-intel',
    minPlan: 'pro',
    allowedRoles: ['owner', 'admin', 'manager'],
    accessLevel: 'restricted',
    toolOverrides: {
      // Basic intel tools available to starter
      'detect_anomalies': { minPlan: 'starter', allowedRoles: ['owner', 'admin', 'manager'] },
      'forecast_cash_flow': { minPlan: 'starter', allowedRoles: ['owner', 'admin', 'manager'] }
    }
  }
]

/**
 * Plan hierarchy for comparison
 */
const PLAN_HIERARCHY: Record<PlanKey, number> = {
  trial: 0,
  starter: 1,
  pro: 2,
  enterprise: 3
}

/**
 * Check if user's plan meets or exceeds required plan
 */
function meetsMinPlan(userPlan: PlanKey, minPlan: PlanKey): boolean {
  return PLAN_HIERARCHY[userPlan] >= PLAN_HIERARCHY[minPlan]
}

/**
 * Check if user's role is in allowed roles list
 */
function hasAllowedRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  // Empty allowed roles = all roles allowed
  if (allowedRoles.length === 0) {
    return true
  }
  return allowedRoles.includes(userRole)
}

/**
 * Get user's current subscription plan
 * In production, this would query the subscription service
 */
export async function getUserPlan(userContext: UserContext): Promise<PlanKey> {
  // TODO: Integrate with subscription service
  // For now, use metadata if available or default to trial
  const planFromContext = (userContext as { planKey?: PlanKey }).planKey

  if (planFromContext && PLAN_HIERARCHY[planFromContext] !== undefined) {
    return planFromContext
  }

  // Default to trial for safety
  return 'trial'
}

/**
 * Get user's role in their current business
 * In production, this would query the membership service
 */
export async function getUserRole(userContext: UserContext): Promise<UserRole> {
  // TODO: Integrate with membership service
  // For now, use metadata if available or default to employee
  const roleFromContext = (userContext as { role?: UserRole }).role

  if (roleFromContext) {
    return roleFromContext
  }

  // Default to employee (least privilege) for safety
  return 'employee'
}

/**
 * Check if user can access a specific MCP tool
 *
 * @param serverId - The MCP server ID
 * @param toolName - The tool name (without prefix)
 * @param userContext - The user's context
 * @returns Whether access is allowed and reason if denied
 */
export async function canAccessMcpTool(
  serverId: string,
  toolName: string,
  userContext: UserContext
): Promise<{ allowed: boolean; reason?: string }> {
  // Find server permission config
  const serverPermission = MCP_SERVER_PERMISSIONS.find(p => p.serverId === serverId)

  if (!serverPermission) {
    // Unknown server - deny by default (secure default)
    console.warn(`[MCP Permissions] Unknown server ${serverId}, denying access`)
    return { allowed: false, reason: 'Unknown MCP server' }
  }

  // Get user's plan and role
  const userPlan = await getUserPlan(userContext)
  const userRole = await getUserRole(userContext)

  // Check for tool-specific overrides first
  const toolOverride = serverPermission.toolOverrides?.[toolName]
  const minPlan = toolOverride?.minPlan ?? serverPermission.minPlan
  const allowedRoles = toolOverride?.allowedRoles ?? serverPermission.allowedRoles

  // Check plan requirement
  if (!meetsMinPlan(userPlan, minPlan)) {
    return {
      allowed: false,
      reason: `Requires ${minPlan} plan or higher (current: ${userPlan})`
    }
  }

  // Check role requirement
  if (!hasAllowedRole(userRole, allowedRoles)) {
    return {
      allowed: false,
      reason: `Role ${userRole} not authorized for this tool`
    }
  }

  return { allowed: true }
}

/**
 * Filter MCP tools based on user permissions
 *
 * @param tools - Array of MCP tools with serverId
 * @param userContext - The user's context
 * @returns Filtered array of tools the user can access
 */
export async function filterMcpToolsByPermission<T extends { serverId: string; name: string }>(
  tools: T[],
  userContext: UserContext
): Promise<T[]> {
  const allowedTools: T[] = []

  for (const tool of tools) {
    const { allowed } = await canAccessMcpTool(tool.serverId, tool.name, userContext)
    if (allowed) {
      allowedTools.push(tool)
    }
  }

  console.log(`[MCP Permissions] Filtered ${tools.length} tools to ${allowedTools.length} for user ${userContext.userId}`)

  return allowedTools
}

/**
 * Get all allowed MCP servers for a user
 *
 * @param userContext - The user's context
 * @returns Array of server IDs the user can access
 */
export async function getAllowedMcpServers(userContext: UserContext): Promise<string[]> {
  const userPlan = await getUserPlan(userContext)
  const userRole = await getUserRole(userContext)

  return MCP_SERVER_PERMISSIONS
    .filter(permission =>
      meetsMinPlan(userPlan, permission.minPlan) &&
      hasAllowedRole(userRole, permission.allowedRoles)
    )
    .map(permission => permission.serverId)
}

/**
 * Get permission configuration (for health checks/debugging)
 */
export function getMcpPermissionConfig(): McpServerPermission[] {
  return MCP_SERVER_PERMISSIONS
}

/**
 * Add or update server permission at runtime
 * Useful for dynamic configuration from environment
 */
export function setServerPermission(permission: McpServerPermission): void {
  const existingIndex = MCP_SERVER_PERMISSIONS.findIndex(p => p.serverId === permission.serverId)
  if (existingIndex >= 0) {
    MCP_SERVER_PERMISSIONS[existingIndex] = permission
  } else {
    MCP_SERVER_PERMISSIONS.push(permission)
  }
}

/**
 * Extended UserContext with plan/role info
 * Use this type when creating user context with permission data
 */
export interface PermissionAwareUserContext extends UserContext {
  planKey?: PlanKey
  role?: UserRole
}
