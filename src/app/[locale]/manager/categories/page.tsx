/**
 * Manager Categories Page
 * Interface for managing expense and COGS categories
 * SECURITY: Server-side role authorization required
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/domains/security/lib/rbac'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import CategoriesManagementClient from '@/domains/expense-claims/components/categories-management-client'
import { ClientProviders } from '@/components/providers/client-providers'

export default async function CategoriesManagementPage() {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const user = await currentUser()

  if (!user) {
    redirect('/sign-in')
  }

  // SECURITY: Enforce manager role requirement on server-side
  await requirePermission('manager')

  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Category Management"
            subtitle="Manage expense and Cost of Goods Sold categories for your organization"
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
              <CategoriesManagementClient userId={userId} />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}