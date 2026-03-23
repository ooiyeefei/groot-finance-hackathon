// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import ReportsClient from '@/domains/reports/components/reports-client'

interface ReportsPageProps {
  params: Promise<{ locale: string }>
}

export default async function ReportsPage({ params }: ReportsPageProps) {
  const { userId } = await auth()
  const { locale } = await params

  if (!userId) {
    redirect('/sign-in')
  }

  let user = null
  try {
    user = await currentUser()
  } catch (error) {
    console.warn('Failed to fetch user details:', error)
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <HeaderWithUser
            title="Reports"
            subtitle="Generate and manage aging reports"
          />
          <main className="flex-1 overflow-y-auto p-6">
            <ReportsClient />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
