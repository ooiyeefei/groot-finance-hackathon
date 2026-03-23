// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

/**
 * Financial Statements Page
 *
 * Generates Trial Balance, P&L, Balance Sheet, and Cash Flow reports.
 * Access: Owner/Admin and Manager roles only.
 */

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { FinancialStatementsClient } from '@/domains/financial-statements/components/financial-statements-client'

interface FinancialStatementsPageProps {
  params: Promise<{ locale: string }>
}

export default async function FinancialStatementsPage({ params }: FinancialStatementsPageProps) {
  const { userId } = await auth()
  const { locale } = await params

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <HeaderWithUser
            title="Financial Statements"
            subtitle=""
          />

          <main className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4" style={{ contain: 'layout' }}>
            <div className="max-w-7xl mx-auto">
              <FinancialStatementsClient
                businessId=""
                businessName=""
                currency="MYR"
              />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
