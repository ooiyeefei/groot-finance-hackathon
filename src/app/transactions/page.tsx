import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'

export default async function TransactionsPage() {
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
              <h1 className="text-3xl font-bold text-white mb-2">Transactions</h1>
              <p className="text-gray-400">
                View and manage your financial transactions across multiple currencies
              </p>
            </div>
            
            {/* Placeholder Content */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Transaction Management Coming Soon</h3>
                <p className="text-gray-400 mb-4">
                  This feature will allow you to view and manage transactions extracted from your uploaded documents.
                </p>
                <p className="text-gray-500 text-sm">
                  Upload documents in the Documents section to start building your transaction history.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}