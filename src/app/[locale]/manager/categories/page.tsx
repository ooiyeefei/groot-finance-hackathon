// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

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
import { ClientProviders } from '@/components/providers/client-providers'
import { Suspense, lazy } from 'react'
import { Loader2 } from 'lucide-react'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const CategoriesManagementClient = lazy(() => import('@/domains/expense-claims/components/categories-management-client'))

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
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <HeaderWithUser
            title="Category Management"
            subtitle="Manage expense and Cost of Goods Sold categories for your organization"
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-4 sm:p-6 pb-24 sm:pb-6">
            <div className="max-w-7xl mx-auto">
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="ml-2 text-gray-400">Loading categories management...</span>
                </div>
              }>
                <CategoriesManagementClient userId={userId} />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}