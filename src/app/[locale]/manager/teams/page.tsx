/**
 * Teams Management Page
 * Allows managers and finance users to manage team member roles, permissions, and invitations
 * SECURITY: Server-side role authorization required
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/rbac'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import TeamsManagementClient from '@/domains/users/components/teams-management-client'
import { ClientProviders } from '@/components/providers/client-providers'

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
              <TeamsManagementClient userId={userId} />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}