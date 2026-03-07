// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

/**
 * Submission Detail Page - Server Component
 * /[locale]/expense-claims/submissions/[id]
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { SubmissionDetailPage } from '@/domains/expense-claims/components/submission-detail-page'
import { ClientProviders } from '@/components/providers/client-providers'

interface SubmissionPageProps {
  params: Promise<{ locale: string; id: string }>
}

export default async function SubmissionPage({ params }: SubmissionPageProps) {
  const { userId } = await auth()
  const { locale, id } = await params

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
            title="Expense Submission"
            subtitle=""
          />
          <main className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4" style={{ contain: 'layout' }}>
            <div className="max-w-7xl mx-auto">
              <SubmissionDetailPage submissionId={id} locale={locale} />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
