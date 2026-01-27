/**
 * Duplicate Report Page
 * Feature: 007-duplicate-expense-detection (User Story 3)
 *
 * Finance admin page for viewing and managing duplicate expense claims.
 * Route: /expense-claims/duplicate-report
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import DuplicateReportPage from '@/domains/expense-claims/components/duplicate-report-page'
import { ClientProviders } from '@/components/providers/client-providers'

interface DuplicateReportRouteProps {
  params: Promise<{ locale: string }>
}

export default async function DuplicateReportRoute({ params }: DuplicateReportRouteProps) {
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

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <HeaderWithUser
            title="Duplicate Report"
            subtitle="Audit potential duplicate expense claims"
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4" style={{ contain: 'layout' }}>
            <div className="max-w-7xl mx-auto">
              <DuplicateReportPage />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
