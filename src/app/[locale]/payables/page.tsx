import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import APDashboard from '@/domains/payables/components/ap-dashboard'
import { ClientProviders } from '@/components/providers/client-providers'
import { getUserRole } from '@/domains/users/lib/user.service'

export default async function PayablesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params

  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // Admin role check - payables page is for finance admins only
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
            title="Payables"
            subtitle="Accounts Payable & Vendor Management"
          />

          <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
            <APDashboard />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
