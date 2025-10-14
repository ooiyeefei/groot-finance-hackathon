/**
 * Expense Claims Main Page
 * Implements Mel's role-adaptive dashboard with progressive disclosure
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import PersonalExpenseDashboard from '@/domains/expense-claims/components/personal-expense-dashboard'
import { ClientProviders } from '@/components/providers/client-providers'


export default async function ExpenseClaimsPage() {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // Get user info with timeout handling for optional display name
  let user = null
  try {
    user = await currentUser()
  } catch (error) {
    // If user fetch fails, continue without firstName - it's optional
    console.warn('Failed to fetch user details for display name:', error)
  }

  return (
    <ClientProviders>
      
        <div className="flex h-screen bg-gray-900">
          {/* Sidebar */}
          <Sidebar />

          {/* Main Content */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <HeaderWithUser
              title="Expense Claims"
              subtitle=""
            />

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto p-4 sm:p-6">
              <div className="max-w-7xl mx-auto">
                {/* Personal Expense Dashboard */}
                <PersonalExpenseDashboard userId={userId} />
              </div>
            </main>
          </div>
        </div>
      
    </ClientProviders>
  )
}