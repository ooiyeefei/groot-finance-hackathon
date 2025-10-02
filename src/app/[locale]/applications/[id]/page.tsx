import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ApplicationDetailContainer from '@/components/applications/application-detail-container'
import { ClientProviders } from '@/components/providers/client-providers'

interface PageProps {
  params: Promise<{ id: string; locale: string }>
}

export default async function ApplicationDetailPage({ params }: PageProps) {
  const { userId } = await auth()
  const { id, locale } = await params

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        <Sidebar />

        <div className="flex-1 flex flex-col">
          <HeaderWithUser
            title="Application Details"
            subtitle="Manage documents and track application progress"
          />

          <main className="flex-1 overflow-auto p-6">
            <ApplicationDetailContainer applicationId={id} />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}