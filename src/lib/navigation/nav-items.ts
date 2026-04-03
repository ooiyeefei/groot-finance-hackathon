/**
 * Shared Navigation Items Configuration
 *
 * Single source of truth for navigation items used by both:
 * - Sidebar (desktop: src/components/ui/sidebar.tsx)
 * - MobileAppShell / BottomNav (mobile: src/components/ui/mobile-app-shell.tsx)
 *
 * When adding/removing/reordering nav items, change ONLY this file.
 */

import type { ComponentType } from 'react'
import {
  Home,
  FileText,
  CreditCard,
  Receipt,
  Settings,
  FileCheck,
  CalendarDays,
  FileSpreadsheet,
  BarChart3,
  FileBarChart,
  Inbox,
  Package,
} from 'lucide-react'

export interface NavItem {
  icon: ComponentType<{ className?: string }>
  /** Display label (translation key or literal) */
  label: string
  /** Href path WITHOUT locale prefix (e.g. '/' or '/invoices') */
  path: string
  /** Optional badge count */
  badge?: number
}

export interface NavGroup {
  id: string
  items: NavItem[]
}

interface UserRole {
  employee: boolean
  manager: boolean
  finance_admin: boolean
}

/**
 * Returns navigation groups based on user role.
 * Both sidebar and bottom nav consume this.
 */
export function getNavigationGroups(userRole: UserRole): NavGroup[] {
  const isAdmin = userRole.finance_admin

  // Group 1: Finance — dashboard only (hackathon demo)
  const financeGroup: NavGroup = {
    id: 'finance',
    items: isAdmin
      ? [
          { icon: Home, label: 'dashboard', path: '/' },
        ]
      : [],
  }

  // Group 2: Workspace — expense claims + manager approvals only (hackathon demo)
  const workspaceGroup: NavGroup = {
    id: 'workspace',
    items: [
      { icon: Receipt, label: 'expenseClaims', path: '/expense-claims' },
      ...((userRole.manager || userRole.finance_admin)
        ? [
            { icon: FileCheck, label: 'managerApprovals', path: '/manager/approvals' },
          ]
        : []),
    ],
  }

  // Group 3: Utility — hidden for hackathon demo
  const utilityGroup: NavGroup = {
    id: 'utility',
    items: [],
  }

  return [financeGroup, workspaceGroup, utilityGroup].filter(g => g.items.length > 0)
}

/**
 * Returns a flat list of all nav items (for bottom nav).
 */
export function getNavigationItems(userRole: UserRole): NavItem[] {
  return getNavigationGroups(userRole).flatMap(g => g.items)
}
