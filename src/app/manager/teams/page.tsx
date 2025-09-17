/**
 * Teams Management Page
 * Allows managers and finance users to manage team member roles, permissions, and invitations
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import TeamsManagementClient from '@/components/manager/teams-management-client'

export default async function TeamsManagementPage() {
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
          title="Teams Management"
          subtitle=""
        />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            {/* Teams Management Client Component */}
            <TeamsManagementClient userId={userId} />
          </div>
        </main>
      </div>
    </div>
  )
}