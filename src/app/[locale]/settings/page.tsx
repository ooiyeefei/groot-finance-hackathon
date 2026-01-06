import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Suspense, lazy } from 'react'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { User, Loader2 } from 'lucide-react'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const UserProfileSection = lazy(() => import('@/domains/account-management/components/user-profile-section'))

export default async function SettingsPage() {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Settings"
            subtitle="Manage your personal preferences and notifications"
          />

          {/* Main Content Area */}
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-2xl mx-auto">
              {/* Single Consolidated Section */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-success rounded-lg flex items-center justify-center">
                    <User className="w-5 h-5 text-success-foreground" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">Personal Settings</h2>
                    <p className="text-sm text-muted-foreground">Your preferences and notification settings</p>
                  </div>
                </div>

                {/* User Profile Component - Now includes currency, timezone, and notifications */}
                <Suspense fallback={
                  <div className="bg-card rounded-lg border border-border p-6">
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-8 h-8 animate-spin text-success" />
                      <span className="ml-2 text-muted-foreground">Loading settings...</span>
                    </div>
                  </div>
                }>
                  <UserProfileSection />
                </Suspense>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
