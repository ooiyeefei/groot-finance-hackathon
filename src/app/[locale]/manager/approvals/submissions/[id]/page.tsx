/**
 * Manager Submission Review Page
 * Renders the submission detail page in manager view mode with approve/reject actions
 * SECURITY: Server-side role authorization required
 */

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/domains/security/lib/rbac'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { SubmissionDetailPage } from '@/domains/expense-claims/components/submission-detail-page'
import ManagerSubmissionSidebar from '@/domains/expense-claims/components/manager-submission-sidebar'
import { ClientProviders } from '@/components/providers/client-providers'

interface PageProps {
  params: Promise<{ locale: string; id: string }>
}

export default async function ManagerSubmissionReviewPage({ params }: PageProps) {
  const { locale, id } = await params

  const { userId } = await auth()
  if (!userId) {
    redirect('/sign-in')
  }

  try {
    await requirePermission('manager')
  } catch (error) {
    console.error('[Manager Submission Review] Authorization failed:', error)
    redirect('/')
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <HeaderWithUser title="Review Submission" subtitle="" />
          <div className="flex-1 flex overflow-hidden">
            <ManagerSubmissionSidebar currentSubmissionId={id} />
            <main className="flex-1 overflow-auto p-4 sm:p-6 pb-24 sm:pb-6">
              <div className="max-w-7xl mx-auto">
                <SubmissionDetailPage
                  submissionId={id}
                  locale={locale}
                  viewMode="manager"
                />
              </div>
            </main>
          </div>
        </div>
      </div>
    </ClientProviders>
  )
}

export const metadata = {
  title: 'Review Submission | Groot Finance',
  description: 'Review and approve or reject an expense submission'
}
