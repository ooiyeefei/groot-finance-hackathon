// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import InvoicesTabContainer from '@/domains/invoices/components/invoices-tab-container'
import { ClientProviders } from '@/components/providers/client-providers'
import { getUserRole } from '@/domains/users/lib/user.service'

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params

  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // Admin role check - invoices page is for finance admins only
  const roleData = await getUserRole()
  const isAdmin = roleData?.permissions?.finance_admin

  if (!isAdmin) {
    console.log(`[Invoices] Non-admin user redirected to expense-claims`)
    redirect(`/${locale}/expense-claims`)
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <HeaderWithUser
            title="Invoices"
            subtitle=""
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
            <InvoicesTabContainer />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}