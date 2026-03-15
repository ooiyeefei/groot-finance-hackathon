// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import BankReconTab from '@/domains/accounting/components/bank-recon/bank-recon-tab'

export default async function BankReconciliationPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <HeaderWithUser title="Bank Reconciliation" subtitle="Import bank statements and reconcile against journal entries" />
          <main className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4" style={{ contain: 'layout' }}>
            <div className="max-w-7xl mx-auto">
              <BankReconTab />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
