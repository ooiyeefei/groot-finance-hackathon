import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { getUserRole } from '@/domains/users/lib/user.service'
import VendorManager from '@/domains/payables/components/vendor-manager'

export default async function VendorsPage({ params }: { params: Promise<{ locale: string }> }) {
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

        <div className="flex-1 flex flex-col">
          <HeaderWithUser
            title="Vendor Directory"
            subtitle="Manage your suppliers and vendors"
          />

          <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
            <VendorManager />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
