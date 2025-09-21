import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import CompleteDashboard from '@/components/dashboard/complete-dashboard'
import { GeneralDisclaimer } from '@/components/ui/financial-disclaimer'

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
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            {/* Complete Financial Dashboard with Charts */}
            <CompleteDashboard />
          </div>
        </main>

        {/* Footer Disclaimer */}
        <footer className="border-t border-gray-700 p-4">
          <div className="max-w-7xl mx-auto">
            <GeneralDisclaimer />
          </div>
        </footer>
      </div>
    </div>
  )
}
