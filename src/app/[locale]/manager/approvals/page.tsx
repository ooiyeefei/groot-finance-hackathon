/**
 * Manager Approvals Page
 * Dashboard for managers to review and approve expense claims
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import EnhancedApprovalDashboard from '@/components/manager/enhanced-approval-dashboard'
import { ClientProviders } from '@/components/providers/client-providers'

export default async function ApprovalsPage({ params }: { params: Promise<{ locale: string }> }) {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const user = await currentUser()

  // Await params in Next.js 15
  const { locale } = await params

  // Get translations for server component with explicit locale
  const t = await getTranslations({locale, namespace: 'manager'})

  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title={t('title')}
            subtitle={t('subtitle')}
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Enhanced Approval Dashboard */}
              <EnhancedApprovalDashboard userId={userId} />
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