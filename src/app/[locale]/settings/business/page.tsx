/**
 * Business Profile Settings Page
 * Company information, logo, and basic settings (managers and admins only)
 * SECURITY: Server-side role authorization required
 */

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/domains/security/lib/rbac'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { Suspense, lazy } from 'react'
import { Loader2, Building2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

// PERFORMANCE OPTIMIZATION: Dynamic import for business profile component
const BusinessProfileSettings = lazy(() => import('@/domains/account-management/components/business-profile-settings'))

export default async function BusinessProfilePage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // SECURITY: Server-side role authorization - require manager or admin permission
  try {
    await requirePermission('manager') // This allows both manager and admin
  } catch (error) {
    console.error('[Business Profile Page] Authorization failed:', error)
    redirect('/')
  }

  const { locale } = await params

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <HeaderWithUser
            title="Business Profile"
            subtitle="Manage your company information and basic settings"
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-4 sm:p-6 pb-24 sm:pb-6">
            <div className="max-w-4xl mx-auto">

              {/* Back Navigation */}
              <Link
                href={`/${locale}/business-settings`}
                className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Business Settings
              </Link>

              {/* Business Profile Section */}
              <div className="bg-gray-800 rounded-lg border border-border p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  <div>
                    <h3 className="text-lg font-semibold text-white">Company Information</h3>
                    <p className="text-sm text-gray-400">Update your business profile and branding</p>
                  </div>
                </div>

                <Suspense fallback={
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="ml-2 text-gray-400">Loading business profile...</span>
                  </div>
                }>
                  <BusinessProfileSettings />
                </Suspense>
              </div>

            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}