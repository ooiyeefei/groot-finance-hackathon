'use client'

import { Suspense, lazy, memo, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Building2, DollarSign, Users, Key, Loader2, Calendar } from 'lucide-react'
import { usePermissions } from '@/contexts/business-context'
import { useUser } from '@clerk/nextjs'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// PERFORMANCE OPTIMIZATION: Dynamic imports for tab content (reuse existing components)
const BusinessProfileSettings = lazy(() => import('@/domains/account-management/components/business-profile-settings'))
const CategoriesManagementClient = lazy(() => import('@/domains/expense-claims/components/categories-management-client'))
const TeamsManagementClient = lazy(() => import('@/domains/account-management/components/teams-management-client'))
const ApiKeysManagementClient = lazy(() => import('@/domains/api-keys/components/api-keys-management-client'))
const LeaveManagementSettings = lazy(() => import('@/domains/leave-management/components/leave-management-settings'))

// Wrapper components for existing components that need userId
const CategoryManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <CategoriesManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-muted-foreground">Please sign in to access this feature.</p></div>
)

const TeamManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <TeamsManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-muted-foreground">Please sign in to access this feature.</p></div>
)

const TabbedBusinessSettings = memo(() => {
  const { isManager, isOwner } = usePermissions()
  const { user } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // URL-based tab persistence: read from ?tab= query param
  const validTabs = ['business-profile', 'category-management', 'leave-management', 'team-management', 'api-keys'] as const
  type TabValue = typeof validTabs[number]
  const tabFromUrl = searchParams.get('tab') as TabValue | null
  const activeTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'business-profile'

  // Update URL when tab changes (without full page reload)
  const handleTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  // Only show business management tabs to owners and managers
  const canManageBusiness = isOwner || isManager

  if (!canManageBusiness) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          Business management settings are available to managers and administrators only.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        {/* Tab Navigation - Semantic Design System */}
        <TabsList className={`grid w-full ${isOwner ? 'grid-cols-5' : 'grid-cols-3'} bg-muted border border-border`}>
          <TabsTrigger
            value="business-profile"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Building2 className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Business</span>
            <span className="sm:hidden">Biz</span>
          </TabsTrigger>
          <TabsTrigger
            value="category-management"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Categories</span>
            <span className="sm:hidden">Cat</span>
          </TabsTrigger>
          <TabsTrigger
            value="leave-management"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Calendar className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Leave</span>
            <span className="sm:hidden">Leave</span>
          </TabsTrigger>
          {isOwner && (
            <TabsTrigger
              value="team-management"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Users className="w-4 h-4 mr-2" />
              Team
            </TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger
              value="api-keys"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Key className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">API Keys</span>
              <span className="sm:hidden">API</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Business Profile Tab Content */}
        <TabsContent value="business-profile" className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading business profile...</span>
              </div>
            }>
              <BusinessProfileSettings />
            </Suspense>
          </div>
        </TabsContent>

        {/* Category Management Tab Content */}
        <TabsContent value="category-management" className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading categories...</span>
              </div>
            }>
              <CategoryManagementTab userId={user?.id} />
            </Suspense>
          </div>
        </TabsContent>

        {/* Leave Management Tab Content */}
        <TabsContent value="leave-management" className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading leave settings...</span>
              </div>
            }>
              <LeaveManagementSettings />
            </Suspense>
          </div>
        </TabsContent>

        {/* Team Management Tab Content - Owner Only */}
        {isOwner && (
          <TabsContent value="team-management" className="space-y-4">
            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Loading team management...</span>
                </div>
              }>
                <TeamManagementTab userId={user?.id} />
              </Suspense>
            </div>
          </TabsContent>
        )}

        {/* API Keys Tab Content - Owner Only */}
        {isOwner && (
          <TabsContent value="api-keys" className="space-y-4">
            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Loading API keys...</span>
                </div>
              }>
                <ApiKeysManagementClient />
              </Suspense>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
})

TabbedBusinessSettings.displayName = 'TabbedBusinessSettings'

export default TabbedBusinessSettings