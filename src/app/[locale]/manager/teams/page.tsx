/**
 * Teams Management Page
 * Allows managers and finance users to manage team member roles, permissions, and invitations
 * SECURITY: Server-side role authorization required
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/domains/security/lib/rbac'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { Suspense, lazy } from 'react'
import { Loader2 } from 'lucide-react'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const TeamsManagementClient = lazy(() => import('@/domains/account-management/components/teams-management-client'))

export default async function TeamsManagementPage() {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // SECURITY: Server-side role authorization - require admin permission for team management
  try {
    await requirePermission('admin')
  } catch (error) {
    console.error('[Teams Page] Authorization failed:', error)
    redirect('/')
  }

  const user = await currentUser()
  
  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Teams Management"
            subtitle=""
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Teams Management Client Component */}
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="ml-2 text-gray-400">Loading teams management...</span>
                </div>
              }>
                <TeamsManagementClient userId={userId} />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}