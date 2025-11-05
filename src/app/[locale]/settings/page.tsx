import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Suspense, lazy } from 'react'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { User, Settings as SettingsIcon, Loader2 } from 'lucide-react'

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
          subtitle="Manage your personal preferences and profile"
        />

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto">
            {/* Single Column Layout - Personal Settings Only */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-success rounded-lg flex items-center justify-center">
                    <User className="w-5 h-5 text-success-foreground" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">Personal Settings</h2>
                    <p className="text-sm text-muted-foreground">Your individual preferences and profile</p>
                  </div>
                </div>

                {/* User Profile Component */}
                <Suspense fallback={
                  <div className="bg-card rounded-lg border border-border p-6">
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-8 h-8 animate-spin text-success" />
                      <span className="ml-2 text-muted-foreground">Loading personal settings...</span>
                    </div>
                  </div>
                }>
                  <UserProfileSection />
                </Suspense>

                {/* Personal Timezone */}
                <div className="bg-card rounded-lg border border-border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <SettingsIcon className="w-5 h-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold text-foreground">Personal Preferences</h3>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Your Timezone
                    </label>
                    <select className="w-full bg-background border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                      <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                      <option value="Asia/Jakarta">Asia/Jakarta (GMT+7)</option>
                      <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (GMT+8)</option>
                      <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                      <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Used for your personal dashboard and notifications
                    </p>
                  </div>
                </div>
            </div>
          </div>
        </main>
        </div>
      </div>
    </ClientProviders>
  )
}