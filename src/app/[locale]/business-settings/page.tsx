/**
 * Business Settings Page
 * Central hub for business management functions (managers and admins only)
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

// PERFORMANCE OPTIMIZATION: Dynamic import for tabbed business settings (only load when needed)
const TabbedBusinessSettings = lazy(() => import('@/domains/account-management/components/tabbed-business-settings'))

export default async function BusinessSettingsPage() {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // SECURITY: Server-side role authorization - require manager or admin permission
  try {
    await requirePermission('manager') // This allows both manager and admin
  } catch (error) {
    console.error('[Business Settings Page] Authorization failed:', error)
    redirect('/')
  }

  const user = await currentUser()

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Business Settings"
            subtitle="Manage your business configuration and team"
          />

          {/* Main Content Area - Full Width Tabbed Interface */}
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="w-full max-w-none">
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Loading business settings...</span>
                </div>
              }>
                <TabbedBusinessSettings />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}