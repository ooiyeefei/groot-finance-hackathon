'use client'

import { Suspense, lazy, memo, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Building2, DollarSign, Users, Key, Loader2, Calendar, Sparkles, User, Plug, Clock, Shield } from 'lucide-react'
import { usePermissions } from '@/contexts/business-context'
import { useUser } from '@clerk/nextjs'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// PERFORMANCE OPTIMIZATION: Dynamic imports for tab content (reuse existing components)
const BusinessProfileSettings = lazy(() => import('@/domains/account-management/components/business-profile-settings'))
const CategoriesManagementClient = lazy(() => import('@/domains/expense-claims/components/categories-management-client'))
const TeamsManagementClient = lazy(() => import('@/domains/account-management/components/teams-management-client'))
const ApiKeysManagementClient = lazy(() => import('@/domains/api-keys/components/api-keys-management-client'))
const LeaveManagementSettings = lazy(() => import('@/domains/leave-management/components/leave-management-settings'))
const BillingSettingsContent = lazy(() => import('@/domains/billing/components/billing-settings-content'))
const StripeIntegrationCard = lazy(() => import('@/domains/account-management/components/stripe-integration-card'))
const UserProfileSection = lazy(() => import('@/domains/account-management/components/user-profile-section'))
const TimesheetSettings = lazy(() => import('@/domains/timesheet-attendance/components/timesheet-settings'))
const PrivacyDataSection = lazy(() => import('@/domains/account-management/components/privacy-data-section').then(m => ({ default: m.PrivacyDataSection })))

// Wrapper components for existing components that need userId
const CategoryManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <CategoriesManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-muted-foreground">Please sign in to access this feature.</p></div>
)

const TeamManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <TeamsManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-muted-foreground">Please sign in to access this feature.</p></div>
)

const TabbedBusinessSettings = memo(() => {
  const { isOwner } = usePermissions()
  const { user } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // URL-based tab persistence: read from ?tab= query param
  const validTabs = ['business-profile', 'category-management', 'leave-management', 'timesheet', 'team-management', 'api-keys', 'billing', 'integrations', 'privacy', 'profile'] as const
  type TabValue = typeof validTabs[number]
  const tabFromUrl = searchParams.get('tab') as TabValue | null
  // Default tab: 'business-profile' for finance_admin/owner, 'profile' for everyone else
  const defaultTab = isOwner ? 'business-profile' : 'profile'
  const activeTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : defaultTab

  // Update URL when tab changes (without full page reload)
  const handleTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  return (
    <div className="w-full space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        {/* Tab Navigation - Semantic Design System */}
        {/* Uses flex-wrap: 1 tab for employee/manager (Profile only), 7 for owner (all tabs) */}
        <TabsList className="flex flex-wrap h-auto p-1 gap-1 bg-muted border border-border">
          {isOwner && (
            <TabsTrigger
              value="business-profile"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Building2 className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Business</span>
              <span className="sm:hidden">Biz</span>
            </TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger
              value="category-management"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Categories</span>
              <span className="sm:hidden">Cat</span>
            </TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger
              value="leave-management"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Calendar className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Leave</span>
              <span className="sm:hidden">Leave</span>
            </TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger
              value="timesheet"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Clock className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Timesheet</span>
              <span className="sm:hidden">Time</span>
            </TabsTrigger>
          )}
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
          {isOwner && (
            <TabsTrigger
              value="billing"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Billing</span>
              <span className="sm:hidden">Bill</span>
            </TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger
              value="integrations"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Plug className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Integrations</span>
              <span className="sm:hidden">Intg</span>
            </TabsTrigger>
          )}
          <TabsTrigger
            value="privacy"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Shield className="w-4 h-4 mr-1.5" />
            <span className="hidden sm:inline">Privacy & Data</span>
            <span className="sm:hidden">Privacy</span>
          </TabsTrigger>
          <TabsTrigger
            value="profile"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <User className="w-4 h-4 mr-2" />
            Profile
          </TabsTrigger>
        </TabsList>

        {/* Business Profile Tab Content - Finance Admin/Owner only */}
        {isOwner && (
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
        )}

        {/* Category Management Tab Content - Finance Admin/Owner only */}
        {isOwner && (
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
        )}

        {/* Leave Management Tab Content - Finance Admin/Owner only */}
        {isOwner && (
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
        )}

        {/* Timesheet Settings Tab Content - Owner Only */}
        {isOwner && (
          <TabsContent value="timesheet" className="space-y-4">
            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Loading timesheet settings...</span>
                </div>
              }>
                <TimesheetSettings />
              </Suspense>
            </div>
          </TabsContent>
        )}

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

        {/* Billing Tab Content - Owner Only */}
        {isOwner && (
          <TabsContent value="billing" className="space-y-4">
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading billing...</span>
              </div>
            }>
              <BillingSettingsContent />
            </Suspense>
          </TabsContent>
        )}

        {/* Integrations Tab Content - Owner Only */}
        {isOwner && (
          <TabsContent value="integrations" className="space-y-4">
            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Loading integrations...</span>
                </div>
              }>
                <StripeIntegrationCard />
              </Suspense>
            </div>
          </TabsContent>
        )}

        {/* Privacy & Data Tab Content - Available to ALL users */}
        <TabsContent value="privacy" className="space-y-4">
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading privacy settings...</span>
            </div>
          }>
            <PrivacyDataSection />
          </Suspense>
        </TabsContent>

        {/* Profile Tab Content - Available to ALL users */}
        <TabsContent value="profile" className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading profile...</span>
              </div>
            }>
              <UserProfileSection />
            </Suspense>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
})

TabbedBusinessSettings.displayName = 'TabbedBusinessSettings'

export default TabbedBusinessSettings