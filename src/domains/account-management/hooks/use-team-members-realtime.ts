'use client'

/**
 * Real-time Team Members Hook using Convex subscriptions
 *
 * This hook provides TRUE real-time updates for team member management.
 * Unlike React Query polling, Convex subscriptions push updates instantly
 * when data changes in the database.
 *
 * Architecture:
 * - useQuery subscribes to Convex query via WebSocket
 * - Any mutation (role update, removal, manager assignment) triggers instant UI update
 * - No polling, no manual refresh, no invalidateQueries() needed
 *
 * This replaces the React Query + REST API approach in teams-management-client.tsx
 * which had 3-4 second delays due to:
 * mutation → onSuccess → invalidateQueries → refetch → UI update
 *
 * With Convex:
 * mutation → database change → server push → UI update (instant)
 */

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

// Match existing TeamMember interface from teams-management-client.tsx
export interface TeamMember {
  id: string
  membership_id: string
  employee_id?: string
  user_id: string
  full_name?: string
  email?: string
  department?: string
  job_title?: string
  role_permissions: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
  created_at: string
  clerk_user?: {
    id?: string
    firstName?: string
    lastName?: string
    emailAddresses?: Array<{ emailAddress: string }>
  }
  manager_id?: string
  manager_name?: string
  manager_user_id_field?: string
}

// UserRole includes 'owner' for full role management
// IAM rules in the frontend determine who can assign which roles
export type UserRole = 'employee' | 'manager' | 'owner'

interface UseTeamMembersRealtimeOptions {
  businessId?: string
}

interface UseTeamMembersRealtimeReturn {
  teamMembers: TeamMember[]
  isLoading: boolean
  error: Error | null
  // Mutations
  updateRole: (membershipId: string, newRole: UserRole) => Promise<void>
  removeMember: (membershipId: string) => Promise<void>
  assignManager: (employeeUserId: string, managerUserId: string | null) => Promise<void>
  // Operation loading states
  updating: Set<string>
}

/**
 * Map Convex team member to existing TeamMember interface
 * This ensures compatibility with existing teams-management-client.tsx components
 */
function mapConvexTeamMember(member: {
  id: Id<'business_memberships'>
  membership_id: Id<'business_memberships'>
  user_id: Id<'users'>
  business_id: Id<'businesses'>
  role: string
  role_permissions: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
  status: string
  full_name: string | null
  email: string | null
  home_currency: string
  clerk_user_id: string | null
  manager_id: Id<'users'> | null
  manager_user_id: Id<'users'> | null
  manager_name: string | null
  created_at: string
  updated_at: string
}): TeamMember {
  return {
    id: member.id,
    membership_id: member.membership_id,
    user_id: member.user_id,
    full_name: member.full_name || undefined,
    email: member.email || undefined,
    role_permissions: member.role_permissions,
    created_at: member.created_at,
    manager_id: member.manager_id || undefined,
    manager_name: member.manager_name || undefined,
    // Clerk user data - we'll map what we have
    clerk_user: member.clerk_user_id
      ? {
          id: member.clerk_user_id,
          // Note: Full Clerk user data needs to be fetched separately
          // For now, we use the data from Convex users table
        }
      : undefined,
  }
}

/**
 * Real-time hook for team members using Convex subscriptions
 *
 * Usage:
 * ```tsx
 * const {
 *   teamMembers,
 *   isLoading,
 *   updateRole,
 *   removeMember,
 *   assignManager,
 *   updating,
 * } = useTeamMembersRealtime({ businessId })
 * ```
 */
export function useTeamMembersRealtime(
  options: UseTeamMembersRealtimeOptions = {}
): UseTeamMembersRealtimeReturn {
  const { businessId } = options

  // State for tracking operations
  const [updating, setUpdating] = useState(new Set<string>())

  // Real-time Convex query - automatically updates when data changes
  // This is the key: NO polling, NO manual refetch needed
  const result = useQuery(
    api.functions.memberships.getTeamMembersWithManagers,
    businessId ? { businessId } : 'skip'
  )

  // Convex mutations - these automatically trigger query updates
  const updateRoleMutation = useMutation(api.functions.memberships.updateRoleByStringIds)
  const removeMemberMutation = useMutation(api.functions.memberships.removeMember)
  const assignManagerMutation = useMutation(api.functions.memberships.assignManager)

  // Map Convex response to existing interface
  const teamMembers = useMemo(() => {
    if (!result) return []
    return result.map(mapConvexTeamMember)
  }, [result])

  // Update role operation
  const updateRole = useCallback(
    async (membershipId: string, newRole: UserRole): Promise<void> => {
      if (!businessId) {
        throw new Error('Business ID is required')
      }

      try {
        setUpdating((prev) => new Set(prev).add(membershipId))

        // Find the user ID for this membership
        const member = teamMembers.find((m) => m.id === membershipId)
        if (!member) {
          throw new Error('Member not found')
        }

        await updateRoleMutation({
          userId: member.user_id,
          businessId,
          newRole,
        })
        // No need to invalidate queries - Convex auto-updates!
      } finally {
        setUpdating((prev) => {
          const newSet = new Set(prev)
          newSet.delete(membershipId)
          return newSet
        })
      }
    },
    [businessId, teamMembers, updateRoleMutation]
  )

  // Remove member operation
  const removeMember = useCallback(
    async (membershipId: string): Promise<void> => {
      try {
        setUpdating((prev) => new Set(prev).add(membershipId))

        // removeMember expects Convex ID
        await removeMemberMutation({
          membershipId: membershipId as Id<'business_memberships'>,
        })
        // No need to invalidate queries - Convex auto-updates!
      } finally {
        setUpdating((prev) => {
          const newSet = new Set(prev)
          newSet.delete(membershipId)
          return newSet
        })
      }
    },
    [removeMemberMutation]
  )

  // Assign manager operation
  const assignManager = useCallback(
    async (employeeUserId: string, managerUserId: string | null): Promise<void> => {
      if (!businessId) {
        throw new Error('Business ID is required')
      }

      try {
        setUpdating((prev) => new Set(prev).add(employeeUserId))

        await assignManagerMutation({
          businessId,
          employeeUserId,
          managerUserId: managerUserId || undefined,
        })
        // No need to invalidate queries - Convex auto-updates!
      } finally {
        setUpdating((prev) => {
          const newSet = new Set(prev)
          newSet.delete(employeeUserId)
          return newSet
        })
      }
    },
    [businessId, assignManagerMutation]
  )

  return {
    teamMembers,
    isLoading: result === undefined,
    error: null, // Convex throws errors, doesn't return them
    updateRole,
    removeMember,
    assignManager,
    updating,
  }
}
