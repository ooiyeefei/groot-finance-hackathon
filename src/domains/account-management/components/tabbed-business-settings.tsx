'use client'

import { Suspense, lazy, memo, useCallback, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Building2, DollarSign, Users, Loader2, Sparkles, User, Gift } from 'lucide-react'
import { usePermissions } from '@/contexts/business-context'
import { isNativePlatform } from '@/lib/capacitor/platform'
import { useUser } from '@clerk/nextjs'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// PERFORMANCE OPTIMIZATION: Dynamic imports for tab content
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
const ReferralDashboard = lazy(() => import('@/domains/referral/components/referral-dashboard'))
const EInvoiceSettingsWithTabs = lazy(() => import('@/domains/account-management/components/einvoice-settings-with-tabs'))
const AIAutomationSettings = lazy(() => import('@/domains/account-management/components/ai-automation-settings').then(m => ({ default: m.AIAutomationSettings })))

// Wrapper components for existing components that need userId
const CategoryManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <CategoriesManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-muted-foreground">Please sign in to access this feature.</p></div>
)

const TeamManagementTab = ({ userId }: { userId?: string }) => (
  userId ? <TeamsManagementClient userId={userId} /> : <div className="text-center py-8"><p className="text-muted-foreground">Please sign in to access this feature.</p></div>
)

// Sub-section navigation within a tab
function SubSection({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {label}
    </button>
  )
}

// Loading fallback
function TabLoader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <span className="ml-2 text-muted-foreground">Loading {title}...</span>
    </div>
  )
}

const TabbedBusinessSettings = memo(() => {
  const { isOwner, canChangeSettings, canManageSubscription } = usePermissions()
  const { user } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const canViewBusinessSettings = canChangeSettings || isOwner

  // Sub-section state for grouped tabs
  const [financeSection, setFinanceSection] = useState<'categories' | 'integrations' | 'ai'>('categories')
  const [peopleSection, setPeopleSection] = useState<'team' | 'leave' | 'timesheet'>('team')
  const [profileSection, setProfileSection] = useState<'profile' | 'privacy'>('profile')

  // Tab routing
  const validTabs = ['business', 'finance', 'people', 'billing', 'referral', 'profile',
    // Legacy tab values — redirect to new grouped tabs
    'business-profile', 'category-management', 'leave-management', 'timesheet',
    'team-management', 'api-keys', 'integrations', 'einvoice', 'ai-automation', 'privacy'] as const
  type TabValue = typeof validTabs[number]
  const tabFromUrl = searchParams.get('tab') as TabValue | null
  const defaultTab = canViewBusinessSettings ? 'business' : 'profile'

  // Map legacy tab values to new grouped tabs
  function resolveTab(tab: TabValue | null): string {
    if (!tab) return defaultTab
    switch (tab) {
      case 'business-profile': return 'business'
      case 'category-management': setFinanceSection('categories'); return 'finance'
      case 'integrations': setFinanceSection('integrations'); return 'finance'
      case 'ai-automation': setFinanceSection('ai'); return 'finance'
      case 'team-management': setPeopleSection('team'); return 'people'
      case 'leave-management': setPeopleSection('leave'); return 'people'
      case 'timesheet': setPeopleSection('timesheet'); return 'people'
      case 'einvoice': return 'business'
      case 'privacy': setProfileSection('privacy'); return 'profile'
      default: return tab
    }
  }

  const activeTab = resolveTab(tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : null)

  const handleTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  return (
    <div className="w-full space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        {/* Simplified tab navigation — 6 tabs max */}
        <TabsList className="flex flex-wrap h-auto p-1 gap-1 bg-muted border border-border">
          {canViewBusinessSettings && (
            <TabsTrigger
              value="business"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Business
            </TabsTrigger>
          )}
          {canViewBusinessSettings && (
            <TabsTrigger
              value="finance"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Finance
            </TabsTrigger>
          )}
          {canViewBusinessSettings && (
            <TabsTrigger
              value="people"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Users className="w-4 h-4 mr-2" />
              People
            </TabsTrigger>
          )}
          {isOwner && !isNativePlatform() && (
            <TabsTrigger
              value="billing"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Billing
            </TabsTrigger>
          )}
          <TabsTrigger
            value="referral"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Gift className="w-4 h-4 mr-1.5" />
            Referral
          </TabsTrigger>
          <TabsTrigger
            value="profile"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <User className="w-4 h-4 mr-1.5" />
            Profile
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* BUSINESS TAB — Profile + e-Invoice Settings (consolidated)   */}
        {/* ============================================================ */}
        {canViewBusinessSettings && (
          <TabsContent value="business" className="space-y-4">
            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={<TabLoader title="business profile" />}>
                <BusinessProfileSettings />
              </Suspense>
            </div>
            {/* E-Invoice notification settings (the only fully-implemented part) */}
            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={<TabLoader title="e-invoice settings" />}>
                <EInvoiceSettingsWithTabs />
              </Suspense>
            </div>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* FINANCE TAB — Categories | Integrations | AI & Automation    */}
        {/* ============================================================ */}
        {canViewBusinessSettings && (
          <TabsContent value="finance" className="space-y-4">
            {/* Sub-section navigation */}
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
              <SubSection label="Categories" isActive={financeSection === 'categories'} onClick={() => setFinanceSection('categories')} />
              <SubSection label="Integrations" isActive={financeSection === 'integrations'} onClick={() => setFinanceSection('integrations')} />
              <SubSection label="AI & Automation" isActive={financeSection === 'ai'} onClick={() => setFinanceSection('ai')} />
            </div>

            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={<TabLoader title={financeSection} />}>
                {financeSection === 'categories' && <CategoryManagementTab userId={user?.id} />}
                {financeSection === 'integrations' && (
                  <div className="space-y-6">
                    <StripeIntegrationCard />
                    <div className="pt-4 border-t border-border">
                      <Suspense fallback={<TabLoader title="API keys" />}>
                        <ApiKeysManagementClient />
                      </Suspense>
                    </div>
                  </div>
                )}
                {financeSection === 'ai' && <AIAutomationSettings />}
              </Suspense>
            </div>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* PEOPLE TAB — Team | Leave | Timesheet                        */}
        {/* ============================================================ */}
        {canViewBusinessSettings && (
          <TabsContent value="people" className="space-y-4">
            {/* Sub-section navigation */}
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
              <SubSection label="Team" isActive={peopleSection === 'team'} onClick={() => setPeopleSection('team')} />
              <SubSection label="Leave" isActive={peopleSection === 'leave'} onClick={() => setPeopleSection('leave')} />
              <SubSection label="Timesheet" isActive={peopleSection === 'timesheet'} onClick={() => setPeopleSection('timesheet')} />
            </div>

            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={<TabLoader title={peopleSection} />}>
                {peopleSection === 'team' && <TeamManagementTab userId={user?.id} />}
                {peopleSection === 'leave' && <LeaveManagementSettings />}
                {peopleSection === 'timesheet' && <TimesheetSettings />}
              </Suspense>
            </div>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* BILLING TAB — Owner only                                     */}
        {/* ============================================================ */}
        {isOwner && !isNativePlatform() && (
          <TabsContent value="billing" className="space-y-4">
            <Suspense fallback={<TabLoader title="billing" />}>
              <BillingSettingsContent />
            </Suspense>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* REFERRAL TAB — All users                                     */}
        {/* ============================================================ */}
        <TabsContent value="referral" className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={<TabLoader title="referral" />}>
              <ReferralDashboard />
            </Suspense>
          </div>
        </TabsContent>

        {/* ============================================================ */}
        {/* PROFILE TAB — User Profile | Privacy & Data                  */}
        {/* ============================================================ */}
        <TabsContent value="profile" className="space-y-4">
          {/* Sub-section navigation */}
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
            <SubSection label="Profile" isActive={profileSection === 'profile'} onClick={() => setProfileSection('profile')} />
            <SubSection label="Privacy & Data" isActive={profileSection === 'privacy'} onClick={() => setProfileSection('privacy')} />
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={<TabLoader title={profileSection} />}>
              {profileSection === 'profile' && <UserProfileSection />}
              {profileSection === 'privacy' && <PrivacyDataSection />}
            </Suspense>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
})

TabbedBusinessSettings.displayName = 'TabbedBusinessSettings'

export default TabbedBusinessSettings
