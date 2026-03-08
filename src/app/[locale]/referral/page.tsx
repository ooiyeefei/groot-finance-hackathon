export const dynamic = 'force-dynamic'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { Suspense, lazy } from 'react'
import { Loader2 } from 'lucide-react'

const ReferralDashboard = lazy(() => import('@/domains/referral/components/referral-dashboard'))

export default async function ReferralPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <HeaderWithUser
            title="Referral Program"
            subtitle="Earn rewards by referring businesses to Groot Finance"
          />
          <main className="flex-1 overflow-auto p-4 sm:p-6 pb-24 sm:pb-6">
            <div className="w-full max-w-2xl mx-auto">
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Loading referral program...</span>
                </div>
              }>
                <ReferralDashboard />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
