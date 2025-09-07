/**
 * Expense Claims Main Page
 * Implements Mel's role-adaptive dashboard with progressive disclosure
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ExpenseDashboard from '@/components/expense-claims/expense-dashboard'

export default async function ExpenseClaimsPage() {
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
          title="Expense Claims" 
          subtitle={`Manage your expense claims${user?.firstName ? `, ${user.firstName}` : ''} - Quick receipt capture and approval workflow`}
        />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            {/* Role-Adaptive Expense Dashboard */}
            <ExpenseDashboard userId={userId} />
          </div>
        </main>
      </div>
    </div>
  )
}