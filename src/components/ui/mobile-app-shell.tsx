'use client'

import * as React from 'react'
import { Home, Receipt, FileText, Settings } from 'lucide-react'
import { BottomNav, BottomNavSpacer, type BottomNavItem } from './bottom-nav'

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
 */
export function MobileAppShell({
  children,
  pendingApprovalsCount = 0,
  locale = 'en'
}: MobileAppShellProps) {
  const navItems: BottomNavItem[] = [
    {
      icon: Home,
      label: 'Dashboard',
      href: `/${locale}`
    },
    {
      icon: Receipt,
      label: 'Expenses',
      href: `/${locale}/expense-claims`,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined
    },
    {
      icon: FileText,
      label: 'Invoices',
      href: `/${locale}/invoices`
    },
    {
      icon: Settings,
      label: 'Settings',
      href: `/${locale}/settings`
    }
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
