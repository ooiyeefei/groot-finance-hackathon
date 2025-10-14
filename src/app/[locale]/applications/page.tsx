import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ApplicationsContainer from '@/domains/applications/components/applications-container'
import { ClientProviders } from '@/components/providers/client-providers'

export default async function ApplicationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { userId } = await auth()
  const { locale } = await params

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        <Sidebar />

        <div className="flex-1 flex flex-col">
          <HeaderWithUser
            title="Applications"
            subtitle="Personal loan applications and document management"
          />

          <main className="flex-1 overflow-auto p-6">
            <ApplicationsContainer />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}