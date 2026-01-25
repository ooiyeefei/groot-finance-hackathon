/**
 * Manager Approvals Page
 * Dashboard for managers to review and approve expense claims
 * SECURITY: Server-side role authorization required
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/domains/security/lib/rbac'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ExpenseApprovalDashboard from '@/domains/expense-claims/components/expense-approval-dashboard'
import { ClientProviders } from '@/components/providers/client-providers'

export default async function ApprovalsPage() {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // SECURITY: Server-side role authorization - require manager permission for approvals
  try {
    await requirePermission('manager')
  } catch (error) {
    console.error('[Approvals Page] Authorization failed:', error)
    redirect('/')
  }

  const user = await currentUser()
  
  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Expense Approvals"
            subtitle=""
          />

          {/* Main Content Area - pb-24 for mobile bottom nav */}
          <main className="flex-1 overflow-auto p-4 sm:p-6 pb-24 sm:pb-6">
            <div className="max-w-7xl mx-auto">
              {/* Expense Approval Dashboard */}
              <ExpenseApprovalDashboard userId={userId} />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}

export const metadata = {
  title: 'Approvals Dashboard | FinanSEAL',
  description: 'Comprehensive expense management and approval workflows for managers and administrators'
}