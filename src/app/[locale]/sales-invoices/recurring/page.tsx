// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { getUserRole } from '@/domains/users/lib/user.service'
import RecurringScheduleManager from '@/domains/sales-invoices/components/recurring-schedule-manager'

export default async function RecurringInvoicesPage({ params }: { params: Promise<{ locale: string }> }) {
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
            title="Recurring Invoices"
            subtitle="Manage automated invoice schedules"
          />

          <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
            <RecurringScheduleManager />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
