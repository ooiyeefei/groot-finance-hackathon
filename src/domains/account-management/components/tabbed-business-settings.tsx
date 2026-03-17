'use client'

import { Suspense, lazy, memo, useCallback, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Building2, DollarSign, Users, Loader2, Sparkles, User, Gift, Plug, Shield } from 'lucide-react'
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

// Sub-section pill navigation within a tab
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

/**
 * Settings Page — Consolidated Tab Layout
 *
 * 7 top-level tabs:
 * - Business: profile + address + e-invoice compliance (TIN, BRN, MSIC)
 * - Finance: Categories | e-Invoice (connection + notifications) | AI & Automation
 * - People: Team | Leave | Timesheet
 * - Integrations: Stripe + API Keys
 * - Billing: owner-only subscription management
 * - Referral: all users
 * - Personal: user profile | privacy & data
 */
const TabbedBusinessSettings = memo(() => {
  const { isOwner, canChangeSettings } = usePermissions()
  const { user } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const canViewBusinessSettings = canChangeSettings || isOwner

  // Sub-section state for grouped tabs
  const [financeSection, setFinanceSection] = useState<'categories' | 'ai'>('categories')
  const [peopleSection, setPeopleSection] = useState<'team' | 'leave' | 'timesheet'>('team')
  const [integrationsSection, setIntegrationsSection] = useState<'stripe' | 'einvoice' | 'api-keys'>('stripe')
  const [personalSection, setPersonalSection] = useState<'profile' | 'privacy'>('profile')

  // Tab routing — supports legacy URLs
  const validTabs = ['business', 'finance', 'people', 'integrations', 'billing', 'referral', 'personal',
    // Legacy tab values — auto-redirect to new grouped tabs
    'business-profile', 'category-management', 'leave-management', 'timesheet',
    'team-management', 'api-keys', 'einvoice', 'ai-automation', 'privacy', 'profile'] as const
  type TabValue = typeof validTabs[number]
  const tabFromUrl = searchParams.get('tab') as TabValue | null
  const defaultTab = canViewBusinessSettings ? 'business' : 'personal'

  // Map legacy tab values to new grouped tabs
  function resolveTab(tab: TabValue | null): string {
    if (!tab) return defaultTab
    switch (tab) {
      case 'business-profile': return 'business'
      case 'category-management': setFinanceSection('categories'); return 'finance'
      case 'einvoice': setIntegrationsSection('einvoice'); return 'integrations'
      case 'ai-automation': setFinanceSection('ai'); return 'finance'
      case 'team-management': setPeopleSection('team'); return 'people'
      case 'leave-management': setPeopleSection('leave'); return 'people'
      case 'timesheet': setPeopleSection('timesheet'); return 'people'
      case 'api-keys': setIntegrationsSection('api-keys'); return 'integrations'
      case 'privacy': setPersonalSection('privacy'); return 'personal'
      case 'profile': setPersonalSection('profile'); return 'personal'
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
        {/* 7-tab navigation */}
        <TabsList className="flex flex-wrap h-auto p-1 gap-1 bg-muted border border-border">
          {canViewBusinessSettings && (
            <TabsTrigger value="business" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="w-4 h-4 mr-2" />
              Business
            </TabsTrigger>
          )}
          {canViewBusinessSettings && (
            <TabsTrigger value="finance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <DollarSign className="w-4 h-4 mr-2" />
              Finance
            </TabsTrigger>
          )}
          {canViewBusinessSettings && (
            <TabsTrigger value="people" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="w-4 h-4 mr-2" />
              People
            </TabsTrigger>
          )}
          {canViewBusinessSettings && (
            <TabsTrigger value="integrations" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Plug className="w-4 h-4 mr-2" />
              Integrations
            </TabsTrigger>
          )}
          {isOwner && !isNativePlatform() && (
            <TabsTrigger value="billing" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Sparkles className="w-4 h-4 mr-2" />
              Billing
            </TabsTrigger>
          )}
          <TabsTrigger value="referral" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Gift className="w-4 h-4 mr-1.5" />
            Referral
          </TabsTrigger>
          <TabsTrigger value="personal" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <User className="w-4 h-4 mr-1.5" />
            Personal
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* BUSINESS — Profile + Address + e-Invoice compliance fields   */}
        {/* (TIN, BRN, MSIC, structured address — identity fields)      */}
        {/* ============================================================ */}
        {canViewBusinessSettings && (
          <TabsContent value="business" className="space-y-4">
            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={<TabLoader title="business profile" />}>
                <BusinessProfileSettings />
              </Suspense>
            </div>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* FINANCE — Categories | AI & Automation                       */}
        {/* ============================================================ */}
        {canViewBusinessSettings && (
          <TabsContent value="finance" className="space-y-4">
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
              <SubSection label="Categories" isActive={financeSection === 'categories'} onClick={() => setFinanceSection('categories')} />
              <SubSection label="AI & Automation" isActive={financeSection === 'ai'} onClick={() => setFinanceSection('ai')} />
            </div>

            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={<TabLoader title={financeSection} />}>
                {financeSection === 'categories' && <CategoryManagementTab userId={user?.id} />}
                {financeSection === 'ai' && <AIAutomationSettings />}
              </Suspense>
            </div>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* PEOPLE — Team | Leave | Timesheet                            */}
        {/* ============================================================ */}
        {canViewBusinessSettings && (
          <TabsContent value="people" className="space-y-4">
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
        {/* INTEGRATIONS — Stripe | e-Invoice (LHDN) | API Keys          */}
        {/* ============================================================ */}
        {canViewBusinessSettings && (
          <TabsContent value="integrations" className="space-y-4">
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
              <SubSection label="Stripe" isActive={integrationsSection === 'stripe'} onClick={() => setIntegrationsSection('stripe')} />
              <SubSection label="e-Invoice" isActive={integrationsSection === 'einvoice'} onClick={() => setIntegrationsSection('einvoice')} />
              <SubSection label="API Keys" isActive={integrationsSection === 'api-keys'} onClick={() => setIntegrationsSection('api-keys')} />
            </div>

            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={<TabLoader title={integrationsSection} />}>
                {integrationsSection === 'stripe' && <StripeIntegrationCard />}
                {integrationsSection === 'einvoice' && <EInvoiceSettingsWithTabs />}
                {integrationsSection === 'api-keys' && <ApiKeysManagementClient />}
              </Suspense>
            </div>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* BILLING — Owner only                                         */}
        {/* ============================================================ */}
        {isOwner && !isNativePlatform() && (
          <TabsContent value="billing" className="space-y-4">
            <Suspense fallback={<TabLoader title="billing" />}>
              <BillingSettingsContent />
            </Suspense>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* REFERRAL — All users                                         */}
        {/* ============================================================ */}
        <TabsContent value="referral" className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={<TabLoader title="referral" />}>
              <ReferralDashboard />
            </Suspense>
          </div>
        </TabsContent>

        {/* ============================================================ */}
        {/* PERSONAL — Profile | Privacy & Data                          */}
        {/* ============================================================ */}
        <TabsContent value="personal" className="space-y-4">
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
            <SubSection label="Profile" isActive={personalSection === 'profile'} onClick={() => setPersonalSection('profile')} />
            <SubSection label="Privacy & Data" isActive={personalSection === 'privacy'} onClick={() => setPersonalSection('privacy')} />
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={<TabLoader title={personalSection} />}>
              {personalSection === 'profile' && <UserProfileSection />}
              {personalSection === 'privacy' && <PrivacyDataSection />}
            </Suspense>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
})

TabbedBusinessSettings.displayName = 'TabbedBusinessSettings'

export default TabbedBusinessSettings
