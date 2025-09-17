/**
 * Client-side RBAC utilities for Clerk integration
 * Following Clerk best practices for role-based access control
 */

'use client'

import React from 'react'
import { useUser } from '@clerk/nextjs'
import { UserRole, RolePermissions } from './rbac'

/**
 * Client-side role checking hook following Clerk patterns
 */
export function useUserRole() {
  const { user } = useUser()
  
  const role = user?.publicMetadata?.role as UserRole
  const permissions = user?.publicMetadata?.permissions as RolePermissions
  
  return {
    role,
    permissions,
    hasRole: (roleToCheck: UserRole) => role === roleToCheck,
    hasAnyRole: (rolesToCheck: UserRole[]) => rolesToCheck.includes(role),
    hasPermission: (permission: keyof RolePermissions) => permissions?.[permission] ?? false,
    canApprove: permissions?.manager || permissions?.admin || false,
    canManageCategories: permissions?.manager || permissions?.admin || false,
    canViewAllExpenses: permissions?.manager || permissions?.admin || false,
    canManageUsers: permissions?.admin || false
  }
}

/**
 * Check if user has specific role (Clerk pattern)
 */
export function checkRole(user: any, role: UserRole): boolean {
  return user?.publicMetadata?.role === role
}

/**
 * Check if user has any of the specified roles
 */
export function checkAnyRole(user: any, roles: UserRole[]): boolean {
  const userRole = user?.publicMetadata?.role as UserRole
  return roles.includes(userRole)
}

/**
 * Check if user has specific permission
 */
export function checkPermission(user: any, permission: keyof RolePermissions): boolean {
  const permissions = user?.publicMetadata?.permissions as RolePermissions
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
  const { user } = useUser()
  
  let hasAccess = false
  
  if (allowedRoles) {
    hasAccess = checkAnyRole(user, allowedRoles)
  } else if (requiredPermission) {
    hasAccess = checkPermission(user, requiredPermission)
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
        { path: '/admin', role: 'admin' as UserRole }
      ]
      
      const restriction = restrictedPaths.find(r => currentPath.startsWith(r.path))
      if (restriction && role !== restriction.role) {
        return '/' // Redirect to dashboard
      }
      
      return null // No redirect needed
    }
  }
}