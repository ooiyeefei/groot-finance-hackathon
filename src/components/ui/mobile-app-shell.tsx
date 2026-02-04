'use client'

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { Home, Receipt, FileText, Settings, CreditCard, MessageSquare, FileCheck, Building2, Sparkles, Palmtree, CalendarDays } from 'lucide-react'
import { BottomNav, BottomNavSpacer, type BottomNavItem } from './bottom-nav'
import { fetchUserRoleWithCache, clearUserRoleCache } from '@/lib/cache-utils'
import { useActiveBusiness } from '@/contexts/business-context'
import { useTranslations } from 'next-intl'

interface UserRole {
  employee: boolean
  manager: boolean
  finance_admin: boolean
}

interface MobileAppShellProps {
  children: React.ReactNode
  /** Current pending approvals count for badge */
  pendingApprovalsCount?: number
  /** Current locale for navigation links */
  locale?: string
}

/**
 * Mobile App Shell with Bottom Navigation
 *
 * Wraps page content and adds mobile-only bottom navigation.
 * The navigation is hidden on screens >= sm (640px) where the sidebar is visible.
 *
 * Features:
 * - Bottom navigation for mobile devices
 * - Badge support for pending approvals
 * - Spacer to prevent content overlap
 * - Responsive - only shows on mobile
 * - Role-based navigation items (manager/admin features)
 * - Horizontally scrollable for overflow items
 */
export function MobileAppShell({
  children,
  pendingApprovalsCount = 0,
  locale = 'en'
}: MobileAppShellProps) {
  const t = useTranslations('navigation')
  const { businessId } = useActiveBusiness()

  // Initialize user role state (default to employee permissions)
  const [userRole, setUserRole] = useState<UserRole>(() => {
    // SSR-safe: return default on server
    if (typeof window === 'undefined') {
      return { employee: true, manager: false, finance_admin: false }
    }
    // Try to restore cached role from localStorage
    try {
      const cached = localStorage.getItem('sidebar-user-role')
      if (cached) {
        return JSON.parse(cached)
      }
    } catch {
      // Ignore parse errors
    }
    return { employee: true, manager: false, finance_admin: false }
  })

  const [hasInitialLoad, setHasInitialLoad] = useState(false)

  // Fetch user role using centralized cache
  const fetchUserRole = useCallback(async () => {
    try {
      const roleData = await fetchUserRoleWithCache()
      if (roleData && roleData.permissions) {
        setUserRole(roleData.permissions)
        // Cache role in localStorage for instant restore
        try {
          localStorage.setItem('sidebar-user-role', JSON.stringify(roleData.permissions))
        } catch {
          // Ignore storage errors
        }
      }
    } catch (error) {
      console.error('[MobileAppShell] Failed to fetch user role:', error)
    }
  }, [])

  // Initial role load
  useEffect(() => {
    fetchUserRole().then(() => setHasInitialLoad(true))
  }, [fetchUserRole])

  // Re-fetch user role when active business changes
  useEffect(() => {
    if (!hasInitialLoad || !businessId) return
    clearUserRoleCache()
    fetchUserRole()
  }, [businessId, fetchUserRole, hasInitialLoad])

  // Check if user is employee-only (not manager or finance_admin)
  const isEmployeeOnly = userRole.employee && !userRole.manager && !userRole.finance_admin

  // Check if user is finance_admin (owner or finance_admin role - has full access)
  const isAdmin = userRole.finance_admin

  // Build navigation items based on user role
  // Dashboard, Invoices, Accounting are admin-only (finance admin features)
  // Managers only see expense claims and approval dashboard
  const coreNavItems: BottomNavItem[] = [
    // Dashboard only visible for admins (finance admin feature)
    ...(isAdmin ? [{
      icon: Home,
      label: t('dashboard'),
      href: `/${locale}`
    }] : []),
    // Invoices only visible for admins (finance admin feature)
    ...(isAdmin ? [{
      icon: FileText,
      label: t('invoices'),
      href: `/${locale}/invoices`
    }] : []),
    {
      icon: Receipt,
      label: t('expenseClaims'),
      href: `/${locale}/expense-claims`,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined
    },
    // Accounting only visible for admins (finance admin feature)
    ...(isAdmin ? [{
      icon: CreditCard,
      label: t('transactions'),
      href: `/${locale}/accounting`
    }] : []),
    {
      icon: MessageSquare,
      label: t('aiAssistant'),
      href: `/${locale}/ai-assistant`
    },
    {
      icon: Palmtree,
      label: t('leave'),
      href: `/${locale}/leave`
    },
    {
      icon: CalendarDays,
      label: t('teamCalendar'),
      href: `/${locale}/team-calendar`
    },
  ]

  // Manager/Finance Admin navigation items
  const managerNavItems: BottomNavItem[] = (userRole.manager || userRole.finance_admin) ? [
    {
      icon: FileCheck,
      label: t('managerApprovals'),
      href: `/${locale}/manager/approvals`
    },
    {
      icon: Building2,
      label: t('businessSettings'),
      href: `/${locale}/business-settings`
    },
    {
      icon: Sparkles,
      label: t('billing'),
      href: `/${locale}/settings/billing`
    },
  ] : []

  // Settings navigation (everyone)
  const settingsNavItems: BottomNavItem[] = [
    {
      icon: Settings,
      label: t('settings'),
      href: `/${locale}/settings`
    }
  ]

  // Combine all nav items
  const navItems: BottomNavItem[] = [
    ...coreNavItems,
    ...managerNavItems,
    ...settingsNavItems
  ]

  return (
    <>
      {children}
      {/* Spacer to prevent content from being hidden behind bottom nav */}
      <BottomNavSpacer className="sm:hidden" />
      {/* Bottom navigation - visible only on mobile */}
      <BottomNav items={navItems} />
    </>
  )
}

export default MobileAppShell
