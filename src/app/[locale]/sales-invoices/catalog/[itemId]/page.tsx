// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { getUserRole } from '@/domains/users/lib/user.service'
import CatalogItemDetail from '@/domains/sales-invoices/components/catalog-item-detail'

export default async function CatalogItemDetailPage({ params }: { params: Promise<{ locale: string; itemId: string }> }) {
  const { locale } = await params

  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const roleData = await getUserRole()
  const isAdmin = roleData?.permissions?.finance_admin

  if (!isAdmin) {
    redirect(`/${locale}/expense-claims`)
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <HeaderWithUser
            title="Catalog Item"
            subtitle="Price history and margin analysis"
          />

          <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
            <CatalogItemDetail />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
