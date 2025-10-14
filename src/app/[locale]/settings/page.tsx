import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import CurrencySettings from '@/domains/users/components/currency-settings'
import BusinessProfileSettings from '@/domains/account-management/components/business-profile-settings'
import { ClientProviders } from '@/components/providers/client-providers'

export default async function SettingsPage() {
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
          title="Settings"
          subtitle="Manage your account preferences and application settings"
        />
        
        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto">
            {/* Settings Sections */}
            <div className="space-y-6">
              {/* Business Profile Settings */}
              <BusinessProfileSettings />

              {/* Currency Settings */}
              <CurrencySettings />

              {/* Language Settings */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Language Preferences</h2>
                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Interface Language
                    </label>
                    <select className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="en">English</option>
                      <option value="th">ไทย (Thai)</option>
                      <option value="id">Bahasa Indonesia</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      AI Assistant Language
                    </label>
                    <select className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="en">English</option>
                      <option value="th">ไทย (Thai)</option>
                      <option value="id">Bahasa Indonesia</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Account Settings */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Account</h2>
                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Timezone
                    </label>
                    <select className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="Asia/Singapore">Asia/Singapore</option>
                      <option value="Asia/Bangkok">Asia/Bangkok</option>
                      <option value="Asia/Jakarta">Asia/Jakarta</option>
                      <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Coming Soon Section */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">More Settings Coming Soon</h3>
                  <p className="text-gray-400 text-sm">
                    Additional settings and preferences will be available in future updates.
                  </p>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button 
                  disabled
                  className="px-6 py-2 bg-blue-600/50 text-white rounded-md font-medium cursor-not-allowed opacity-50"
                >
                  Save Changes (Coming Soon)
                </button>
              </div>
            </div>
          </div>
        </main>
        </div>
      </div>
    </ClientProviders>
  )
}