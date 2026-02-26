'use client'

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { BottomNav, BottomNavSpacer, type BottomNavItem } from './bottom-nav'
import { fetchUserRoleWithCache, clearUserRoleCache } from '@/lib/cache-utils'
import { useActiveBusiness } from '@/contexts/business-context'
import { useTranslations } from 'next-intl'
import { getNavigationItems } from '@/lib/navigation/nav-items'

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
  const pathname = usePathname()
  const { isSignedIn } = useAuth()
  const { businessId } = useActiveBusiness()

  // Hide bottom nav on standalone pages (auth, onboarding) and when signed out
  const isStandalonePage = pathname?.includes('/sign-in')
    || pathname?.includes('/sign-up')
    || pathname?.includes('/onboarding/')
    || pathname?.includes('/invitations/')
    || pathname?.includes('/access-denied')
  const showNav = isSignedIn && !isStandalonePage

  // Hydration-safe: always start with default role to match server render.
  // localStorage is read in useEffect after hydration to avoid mismatch.
  const [userRole, setUserRole] = useState<UserRole>({ employee: true, manager: false, finance_admin: false })

  const [hasInitialLoad, setHasInitialLoad] = useState(false)

  // Fetch user role using centralized cache
  const fetchUserRole = useCallback(async () => {
    try {
      const roleData = await fetchUserRoleWithCache()
      if (roleData && roleData.permissions) {
        setUserRole(roleData.permissions)
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

  // Initial role load — restore from localStorage first for instant UI, then fetch fresh
  useEffect(() => {
    try {
      const cached = localStorage.getItem('sidebar-user-role')
      if (cached) {
        setUserRole(JSON.parse(cached))
      }
    } catch {
      // Ignore parse errors
    }
    fetchUserRole().then(() => setHasInitialLoad(true))
  }, [fetchUserRole])

  // Re-fetch user role when active business changes
  useEffect(() => {
    if (!hasInitialLoad || !businessId) return
    clearUserRoleCache()
    fetchUserRole()
  }, [businessId, fetchUserRole, hasInitialLoad])

  // Build navigation items from shared config (same source as sidebar)
  // Change nav items in src/lib/navigation/nav-items.ts, not here.
  const navItems: BottomNavItem[] = getNavigationItems(userRole).map(item => ({
    icon: item.icon,
    label: t(item.label) || item.label,
    href: `/${locale}${item.path}`,
  }))

  return (
    <>
      {children}
      {showNav && (
        <>
          {/* Spacer to prevent content from being hidden behind bottom nav and chat widget */}
          <BottomNavSpacer />
          {/* Bottom navigation - visible only on mobile */}
          <BottomNav items={navItems} />
        </>
      )}
    </>
  )
}

export default MobileAppShell
