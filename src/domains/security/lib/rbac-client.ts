/**
 * Client-side RBAC utilities for Clerk integration
 * Following Clerk best practices for role-based access control
 */

'use client'

import React from 'react'
import { useUser, useAuth } from '@clerk/nextjs'
import { UserRole, RolePermissions } from '@/domains/security/lib/rbac'

/**
 * Client-side role checking hook following Clerk patterns
 * Uses session claims instead of metadata for security (private metadata not accessible on client)
 */
export function useUserRole() {
  const { user } = useUser()
  const { sessionClaims } = useAuth()

  // Access role data from JWT session claims instead of metadata for security
  const metadata = sessionClaims?.metadata as any
  const role = metadata?.role as UserRole
  const permissions = metadata?.permissions as RolePermissions
  
  return {
    role,
    permissions,
    hasRole: (roleToCheck: UserRole) => role === roleToCheck,
    hasAnyRole: (rolesToCheck: UserRole[]) => rolesToCheck.includes(role),
    hasPermission: (permission: keyof RolePermissions) => permissions?.[permission] ?? false,
    canApprove: permissions?.manager || permissions?.finance_admin || false,
    canManageCategories: permissions?.manager || permissions?.finance_admin || false,
    canViewAllExpenses: permissions?.manager || permissions?.finance_admin || false,
    canManageUsers: permissions?.finance_admin || false
  }
}

/**
 * Check if user has specific role (using session claims for security)
 * Note: Use useUserRole() hook for most cases. This is for direct session claims access.
 */
export function checkRole(sessionClaims: any, role: UserRole): boolean {
  return sessionClaims?.metadata?.role === role
}

/**
 * Check if user has any of the specified roles (using session claims for security)
 * Note: Use useUserRole() hook for most cases. This is for direct session claims access.
 */
export function checkAnyRole(sessionClaims: any, roles: UserRole[]): boolean {
  const userRole = sessionClaims?.metadata?.role as UserRole
  return roles.includes(userRole)
}

/**
 * Check if user has specific permission (using session claims for security)
 * Note: Use useUserRole() hook for most cases. This is for direct session claims access.
 */
export function checkPermission(sessionClaims: any, permission: keyof RolePermissions): boolean {
  const permissions = sessionClaims?.metadata?.permissions as RolePermissions
  return permissions?.[permission] ?? false
}

/**
 * Role-based component wrapper
 */
interface RoleGuardProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
  requiredPermission?: keyof RolePermissions
  fallback?: React.ReactNode
}

export function RoleGuard({
  children,
  allowedRoles,
  requiredPermission,
  fallback = null
}: RoleGuardProps) {
  const { sessionClaims } = useAuth()

  let hasAccess = false

  if (allowedRoles) {
    hasAccess = checkAnyRole(sessionClaims, allowedRoles)
  } else if (requiredPermission) {
    hasAccess = checkPermission(sessionClaims, requiredPermission)
  }

  return hasAccess ? (children as React.ReactNode) : (fallback as React.ReactNode)
}

/**
 * Navigation guard for role-based routing
 */
export function useRoleGuard() {
  const { role, permissions } = useUserRole()
  
  return {
    canAccessRoute: (requiredRole?: UserRole, requiredPermission?: keyof RolePermissions) => {
      if (requiredRole && role !== requiredRole) return false
      if (requiredPermission && !permissions?.[requiredPermission]) return false
      return true
    },
    redirectPath: (currentPath: string) => {
      // Define role-based redirect logic
      if (!role) return '/sign-in'
      
      const restrictedPaths = [
        { path: '/manager', role: 'manager' as UserRole },
        { path: '/admin', role: 'finance_admin' as UserRole }
      ]
      
      const restriction = restrictedPaths.find(r => currentPath.startsWith(r.path))
      if (restriction && role !== restriction.role) {
        return '/' // Redirect to dashboard
      }
      
      return null // No redirect needed
    }
  }
}