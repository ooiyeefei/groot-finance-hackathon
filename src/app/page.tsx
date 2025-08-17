import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import TransactionSummaryCards from '@/components/dashboard/transaction-summary-cards'

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
        <HeaderWithUser 
          title="Dashboard" 
          subtitle={`Welcome to FinanSEAL${user?.firstName ? `, ${user.firstName}` : ''} - Your intelligent financial co-pilot`}
        />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Transaction Summary Dashboard */}
            <TransactionSummaryCards />

            {/* Feature Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
        </main>
      </div>
    </div>
  )
}
