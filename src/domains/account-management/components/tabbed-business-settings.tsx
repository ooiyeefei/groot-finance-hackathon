'use client'

import { useState, Suspense, lazy, memo } from 'react'
import { Building2, DollarSign, Users, ArrowRight, Loader2 } from 'lucide-react'
import { usePermissions } from '@/contexts/business-context'
import { useUser } from '@clerk/nextjs'

// PERFORMANCE OPTIMIZATION: Dynamic imports for tab content (reuse existing components)
const BusinessProfileSettings = lazy(() => import('@/domains/account-management/components/business-profile-settings'))
const CategoriesManagementClient = lazy(() => import('@/domains/expense-claims/components/categories-management-client'))
const TeamsManagementClient = lazy(() => import('@/domains/account-management/components/teams-management-client'))

interface TabData {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'purple' | 'orange'
  available: boolean
  adminOnly?: boolean
  component?: React.ComponentType<{ userId?: string }>
}

// Wrapper components for existing components that need userId
const CategoryManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <CategoriesManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-gray-400">Please sign in to access this feature.</p></div>
)

const TeamManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <TeamsManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-gray-400">Please sign in to access this feature.</p></div>
)

// Memoized tab card component to prevent unnecessary re-renders
const TabCard = memo(({
  tab,
  isActive,
  onClick,
  colorClasses
}: {
  tab: TabData
  isActive: boolean
  onClick: () => void
  colorClasses: { [key: string]: string }
}) => {
  const IconComponent = tab.icon

  return (
    <button
      onClick={onClick}
      className={`
        group relative p-4 rounded-lg border transition-all duration-200 text-left
        ${isActive
          ? `bg-gradient-to-br ${colorClasses[tab.color].split(' ').slice(0, 2).join(' ')} ${colorClasses[tab.color].split(' ')[2]} ring-2 ring-${tab.color}-400/50`
          : `bg-gradient-to-br ${colorClasses[tab.color].split(' ').slice(0, 2).join(' ')} ${colorClasses[tab.color].split(' ')[2]} hover:scale-105 hover:shadow-lg`
        }
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className={`
              p-2 rounded-lg transition-colors
              ${isActive ? 'bg-white/20' : colorClasses[tab.color].split(' ').slice(-2).join(' ')}
            `}>
              <IconComponent className="w-5 h-5" />
            </div>
            <h4 className={`font-semibold ${isActive ? 'text-white' : 'text-white'}`}>
              {tab.title}
            </h4>
            {tab.adminOnly && (
              <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-md">
                Admin
              </span>
            )}
          </div>
          <p className={`text-sm ${isActive ? 'text-gray-200' : 'text-gray-400'}`}>
            {tab.description}
          </p>
        </div>
        <ArrowRight className={`w-5 h-5 transition-colors ${
          isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
        }`} />
      </div>
    </button>
  )
})

const TabbedBusinessSettings = memo(() => {
  const { isAdmin, isManager } = usePermissions()
  const { user } = useUser()
  const [activeTab, setActiveTab] = useState<string>('business-profile')

  // Only show business management tabs to managers and admins
  const canManageBusiness = isAdmin || isManager

  // Tab definitions for business management
  const tabs: TabData[] = [
    {
      id: 'business-profile',
      title: 'Business Profile',
      description: 'Company information, logo, currency preferences, and basic settings',
      icon: Building2,
      color: 'blue',
      available: true,
      component: BusinessProfileSettings
    },
    {
      id: 'category-management',
      title: 'Category Management',
      description: 'Manage expense and COGS categories for your organization',
      icon: DollarSign,
      color: 'green',
      available: true,
      component: CategoryManagementTab
    },
    {
      id: 'team-management',
      title: 'Team Management',
      description: 'Invite members, manage roles and permissions',
      icon: Users,
      color: 'purple',
      available: true,
      adminOnly: true,
      component: TeamManagementTab
    }
  ]

  if (!canManageBusiness) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">
          Business management settings are available to managers and administrators only.
        </p>
      </div>
    )
  }

  const availableTabs = tabs.filter(tab => {
    // Hide admin-only tabs for non-admins
    if (tab.adminOnly && !isAdmin) return false
    return true
  })

  const activeTabData = availableTabs.find(tab => tab.id === activeTab)

  const colorClasses = {
    blue: 'from-blue-600/20 to-blue-800/20 border-blue-500/30 hover:border-blue-400 bg-blue-500/20 text-blue-300',
    green: 'from-green-600/20 to-green-800/20 border-green-500/30 hover:border-green-400 bg-green-500/20 text-green-300',
    purple: 'from-purple-600/20 to-purple-800/20 border-purple-500/30 hover:border-purple-400 bg-purple-500/20 text-purple-300',
    orange: 'from-orange-600/20 to-orange-800/20 border-orange-500/30 hover:border-orange-400 bg-orange-500/20 text-orange-300'
  }

  return (
    <div className="w-full">
      {/* Navigation Cards - Sticky Top */}
      <div className="sticky top-0 z-50 bg-gray-900 pb-6 border-b border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableTabs.map((tab) => (
            <TabCard
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              colorClasses={colorClasses}
            />
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6 bg-gray-800 rounded-lg border border-gray-700 p-6">
        {activeTabData && (
          <>
            {/* Tab Header */}
            <div className="flex items-center gap-3 mb-6">
              <activeTabData.icon className="w-5 h-5 text-gray-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">{activeTabData.title}</h3>
                <p className="text-sm text-gray-400">{activeTabData.description}</p>
              </div>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
              {activeTabData.component ? (
                <Suspense fallback={
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="ml-2 text-gray-400">Loading {activeTabData.title.toLowerCase()}...</span>
                  </div>
                }>
                  <activeTabData.component userId={user?.id} />
                </Suspense>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-400">
                    {activeTabData.title} content coming soon...
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
})

TabbedBusinessSettings.displayName = 'TabbedBusinessSettings'

export default TabbedBusinessSettings