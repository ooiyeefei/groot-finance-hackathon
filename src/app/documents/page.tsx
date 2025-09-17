import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import DocumentsContainer from '@/components/documents/documents-container'

export default async function DocumentsPage() {
  // Server-side authentication check
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }
  
  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <HeaderWithUser
          title="Documents"
          subtitle=""
        />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-6">
          <DocumentsContainer />
        </main>
      </div>
    </div>
  )
}