import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import DocumentsContainer from '@/domains/invoices/components/documents-container'
import { ClientProviders } from '@/components/providers/client-providers'

export default async function DocumentsPage() {
  // Server-side authentication check
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }
  
  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Invoices"
            subtitle=""
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
            <DocumentsContainer />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}