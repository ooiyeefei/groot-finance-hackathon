/**
 * Applications Main Page
 * Lists all applications for the current user/business
 */

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ClientProviders } from '@/components/providers/client-providers'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ApplicationsContainer from '@/domains/applications/components/applications-container'

export default async function ApplicationsPage() {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Applications"
            subtitle="Manage your business applications and document processing"
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Applications Container */}
              <ApplicationsContainer />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}