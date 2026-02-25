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

interface ExpenseClaimsPageProps {
  params: Promise<{ locale: string }>
}

export default async function ExpenseClaimsPage({ params }: ExpenseClaimsPageProps) {
  // Server-side authentication check
  const { userId } = await auth()
  const { locale } = await params

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
      <div className="flex h-screen bg-background">
        {/* Sidebar - hidden on mobile */}
        <Sidebar />

        {/* Main Content - CLS FIX: min-h-0 prevents flex container shift */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Header */}
          <HeaderWithUser
            title="Expense Claims"
            subtitle=""
          />

          {/* Main Content Area - CLS FIX + bottom padding for mobile nav */}
          <main className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4" style={{ contain: 'layout' }}>
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