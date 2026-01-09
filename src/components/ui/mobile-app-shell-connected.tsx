'use client'

/**
 * Mobile App Shell with Connected Badge Count
 *
 * This wrapper component connects to Convex real-time data to display
 * the pending approvals badge count on the Expenses navigation item.
 *
 * Architecture:
 * - Uses useActiveBusiness to get the current business context
 * - Uses useExpenseClaimsRealtime to get real-time pending count
 * - Passes count to MobileAppShell for badge display
 *
 * Note: This is a client component because it uses React hooks.
 * The server-side page renders the shell, and this hydrates with real-time data.
 */

import * as React from 'react'
import { MobileAppShell } from './mobile-app-shell'
import { useActiveBusiness } from '@/contexts/business-context'
import { useExpenseClaimsRealtime } from '@/domains/expense-claims/hooks/use-expense-claims-realtime'

interface MobileAppShellConnectedProps {
  children: React.ReactNode
  /** Current locale for navigation links */
  locale?: string
}

/**
 * Connected Mobile App Shell
 *
 * Wraps MobileAppShell with real-time Convex data for badge counts.
 * Falls back to 0 when business context is loading or unavailable.
 */
export function MobileAppShellConnected({
  children,
  locale = 'en'
}: MobileAppShellConnectedProps) {
  // Get business context for multi-tenancy
  const { businessId, isLoading: isBusinessLoading } = useActiveBusiness()

  // Get real-time expense claims data (limit to minimal fetch for badge count)
  const { dashboardData } = useExpenseClaimsRealtime(businessId, { limit: 100 })

  // Extract pending approvals count (only show for managers/admins who can approve)
  // For employees, this shows their own pending submissions
  const pendingCount = dashboardData?.summary?.pending_approval ?? 0

  return (
    <MobileAppShell
      locale={locale}
      pendingApprovalsCount={pendingCount}
    >
      {children}
    </MobileAppShell>
  )
}

export default MobileAppShellConnected
