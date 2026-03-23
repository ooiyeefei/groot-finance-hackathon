// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import StatementsReviewClient from '@/domains/reports/components/statements-review-client'

interface StatementsReviewPageProps {
  params: Promise<{ locale: string }>
}

export default async function StatementsReviewPage({ params }: StatementsReviewPageProps) {
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
            title="Statements Review"
            subtitle="Review and send debtor statements"
          />
          <main className="flex-1 overflow-y-auto p-6">
            <StatementsReviewClient />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
