/**
 * Manager Approvals Page
 * Dashboard for managers to review and approve expense claims
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ExpenseApprovalDashboard from '@/components/manager/expense-approval-dashboard'

export default async function ApprovalsPage() {
  // Server-side authentication check
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }
  
  const user = await currentUser()
  
  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <HeaderWithUser 
          title="Expense Approvals" 
          subtitle={`Review and approve employee expense claims${user?.firstName ? `, ${user.firstName}` : ''}`}
        />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            {/* Expense Approval Dashboard */}
            <ExpenseApprovalDashboard />
          </div>
        </main>
      </div>
    </div>
  )
}

export const metadata = {
  title: 'Expense Approvals | FinanSEAL',
  description: 'Review and approve employee expense claims'
}