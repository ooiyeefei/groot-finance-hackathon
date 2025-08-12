import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'

export default async function Dashboard() {
  // Server-side authentication check
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }
  
  const user = await currentUser()
  
  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <HeaderWithUser />
        
        {/* Main Content Area */}
        <main className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">
                Welcome to FinanSEAL{user?.firstName && `, ${user.firstName}`}
              </h2>
              <p className="text-gray-400 text-lg mb-6">
                Your intelligent financial co-pilot for Southeast Asian businesses
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                <div className="bg-gray-700 rounded-lg p-6">
                  <h3 className="text-white font-semibold mb-2">Document Processing</h3>
                  <p className="text-gray-400 text-sm">Upload and process invoices, receipts, and financial documents</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-6">
                  <h3 className="text-white font-semibold mb-2">Transaction Management</h3>
                  <p className="text-gray-400 text-sm">Track and manage cross-border cash flows in multiple currencies</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-6">
                  <h3 className="text-white font-semibold mb-2">AI Assistant</h3>
                  <p className="text-gray-400 text-sm">Get localized financial guidance in your preferred language</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
