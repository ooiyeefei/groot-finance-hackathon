import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import FileUploadZone from '@/components/documents/file-upload-zone'

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
        <HeaderWithUser />
        
        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">Documents</h1>
              <p className="text-gray-400">
                Upload and manage your financial documents for processing
              </p>
            </div>
            
            {/* File Upload Zone */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
              <FileUploadZone />
            </div>
            
            {/* Documents List - Placeholder for future */}
            <div className="mt-8 bg-gray-800 rounded-lg border border-gray-700 p-8">
              <h2 className="text-xl font-semibold text-white mb-4">Recent Documents</h2>
              <p className="text-gray-400 text-center py-8">
                No documents uploaded yet. Upload your first document above to get started.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}