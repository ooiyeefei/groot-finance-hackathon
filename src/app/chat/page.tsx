import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'

export default async function ChatPage() {
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
              <h1 className="text-3xl font-bold text-white mb-2">AI Financial Assistant</h1>
              <p className="text-gray-400">
                Get intelligent financial guidance in English, Thai, and Indonesian
              </p>
            </div>
            
            {/* Placeholder Content */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">AI Chat Coming Soon</h3>
                <p className="text-gray-400 mb-4">
                  Our SEA-LION powered AI assistant will help you understand your finances and provide personalized guidance.
                </p>
                <div className="text-gray-500 text-sm space-y-2">
                  <p>• Multi-language support (English, Thai, Indonesian)</p>
                  <p>• Context-aware financial advice</p>
                  <p>• Integration with your transaction data</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}