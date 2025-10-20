import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { Building2, User, Globe, Clock, Settings as SettingsIcon } from 'lucide-react'
import BusinessSettingsSection from '@/domains/account-management/components/business-settings-section'
import UserProfileSection from '@/domains/account-management/components/user-profile-section'

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
          subtitle="Manage business and personal preferences"
        />

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {/* Two-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Left Column: Business-Level Settings (Admin Only) */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Business Settings</h2>
                    <p className="text-sm text-gray-400">Configuration settings for your organization</p>
                  </div>
                </div>

                {/* Business Settings Component */}
                <BusinessSettingsSection />

                {/* Business Timezone */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <h3 className="text-lg font-semibold text-white">Business Timezone</h3>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Default Timezone for Operations
                    </label>
                    <select className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                      <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                      <option value="Asia/Jakarta">Asia/Jakarta (GMT+7)</option>
                      <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (GMT+8)</option>
                      <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                      <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Used for financial reporting and compliance timestamps
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column: User-Level Settings */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Personal Settings</h2>
                    <p className="text-sm text-gray-400">Your individual preferences and profile</p>
                  </div>
                </div>

                {/* User Profile Component */}
                <UserProfileSection />

                {/* Language Settings */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Globe className="w-5 h-5 text-gray-400" />
                    <h3 className="text-lg font-semibold text-white">Language Preferences</h3>
                  </div>
                  <div className="grid gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Interface Language
                      </label>
                      <select className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="en">English</option>
                        <option value="th">ไทย (Thai)</option>
                        <option value="id">Bahasa Indonesia</option>
                        <option value="zh">中文 (Chinese)</option>
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
                        <option value="zh">中文 (Chinese)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Personal Timezone */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <SettingsIcon className="w-5 h-5 text-gray-400" />
                    <h3 className="text-lg font-semibold text-white">Personal Preferences</h3>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Your Timezone
                    </label>
                    <select className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                      <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                      <option value="Asia/Jakarta">Asia/Jakarta (GMT+7)</option>
                      <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (GMT+8)</option>
                      <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                      <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Used for your personal dashboard and notifications
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
        </div>
      </div>
    </ClientProviders>
  )
}