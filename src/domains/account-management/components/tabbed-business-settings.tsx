'use client'

import { Suspense, lazy, memo, useCallback, useState, useMemo } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Building2, DollarSign, Users, Loader2, Sparkles, User, Gift, Plug } from 'lucide-react'
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

// Consistent class names matching Invoice page pattern
const topTriggerClassName =
  'flex items-center gap-2 px-4 py-2.5 rounded-md text-muted-foreground font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm whitespace-nowrap'

const subTriggerClassName =
  'flex items-center gap-2 px-4 py-2 rounded-md text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm whitespace-nowrap text-sm'

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
 * 7 top-level tabs (left-aligned, matching Invoice page):
 * - Business: Business Profile | e-Invoice | Currency
 * - Finance: Categories | AI & Automation
 * - People: Team | Leave | Timesheet
 * - Integrations: Stripe | e-Invoice | API Keys
 * - Billing: owner-only
 * - Referral: all users
 * - Personal: Profile | Privacy & Data
 *
 * Tabs + sub-tabs are sticky on scroll.
 */
const TabbedBusinessSettings = memo(() => {
  const { isOwner, canChangeSettings } = usePermissions()
  const { user } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const canViewBusinessSettings = canChangeSettings || isOwner

  // Resolve legacy tab URLs to new grouped tabs + sub-sections
  const tabFromUrl = searchParams.get('tab')
  const defaultTab = canViewBusinessSettings ? 'business' : 'personal'

  const resolved = useMemo(() => {
    const tab = tabFromUrl || defaultTab
    const defaults = { finance: 'categories' as const, people: 'team' as const, integrations: 'stripe' as const, personal: 'profile' as const, business: 'profile' as const }
    switch (tab) {
      case 'business-profile': return { tab: 'business', ...defaults }
      case 'category-management': return { tab: 'finance', ...defaults }
      case 'ai-automation': return { tab: 'finance', ...defaults, finance: 'ai' as const }
      case 'team-management': return { tab: 'people', ...defaults }
      case 'leave-management': return { tab: 'people', ...defaults, people: 'leave' as const }
      case 'timesheet': return { tab: 'people', ...defaults, people: 'timesheet' as const }
      case 'einvoice': return { tab: 'integrations', ...defaults, integrations: 'einvoice' as const }
      case 'api-keys': return { tab: 'integrations', ...defaults, integrations: 'api-keys' as const }
      case 'privacy': return { tab: 'personal', ...defaults, personal: 'privacy' as const }
      case 'profile': return { tab: 'personal', ...defaults }
      default: return { tab, ...defaults }
    }
  }, [tabFromUrl, defaultTab])

  const activeTab = resolved.tab

  // Sub-section state — initialized from URL-derived defaults, updated by user clicks
  const [businessSection, setBusinessSection] = useState<'profile' | 'einvoice' | 'currency'>(resolved.business)
  const [financeSection, setFinanceSection] = useState<'categories' | 'ai'>(resolved.finance)
  const [peopleSection, setPeopleSection] = useState<'team' | 'leave' | 'timesheet'>(resolved.people)
  const [integrationsSection, setIntegrationsSection] = useState<'stripe' | 'einvoice' | 'api-keys'>(resolved.integrations)
  const [personalSection, setPersonalSection] = useState<'profile' | 'privacy'>(resolved.personal)

  const handleTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  // Render sub-tab navigation (matching invoice page style)
  const renderSubTabs = (
    tabs: Array<{ value: string; label: string }>,
    activeValue: string,
    onChange: (value: string) => void
  ) => (
    <Tabs value={activeValue} onValueChange={onChange}>
      <TabsList className="w-full justify-start border border-border bg-muted rounded-lg p-1 h-auto gap-1">
        {tabs.map(({ value, label }) => (
          <TabsTrigger key={value} value={value} className={subTriggerClassName}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )

  return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {/* Sticky header area: top tabs + sub-tabs */}
        <div className="sticky top-0 z-10 bg-background pb-4 space-y-3">
          {/* Top-level tabs — left-aligned, matching Invoice page */}
          <TabsList className="w-full justify-start border border-border bg-muted rounded-lg p-1 h-auto gap-1">
            {canViewBusinessSettings && (
              <TabsTrigger value="business" className={topTriggerClassName}>
                <Building2 className="w-4 h-4" />
                Business
              </TabsTrigger>
            )}
            {canViewBusinessSettings && (
              <TabsTrigger value="finance" className={topTriggerClassName}>
                <DollarSign className="w-4 h-4" />
                Finance
              </TabsTrigger>
            )}
            {canViewBusinessSettings && (
              <TabsTrigger value="people" className={topTriggerClassName}>
                <Users className="w-4 h-4" />
                People
              </TabsTrigger>
            )}
            {canViewBusinessSettings && (
              <TabsTrigger value="integrations" className={topTriggerClassName}>
                <Plug className="w-4 h-4" />
                Integrations
              </TabsTrigger>
            )}
            {isOwner && !isNativePlatform() && (
              <TabsTrigger value="billing" className={topTriggerClassName}>
                <Sparkles className="w-4 h-4" />
                Billing
              </TabsTrigger>
            )}
            <TabsTrigger value="referral" className={topTriggerClassName}>
              <Gift className="w-4 h-4" />
              Referral
            </TabsTrigger>
            <TabsTrigger value="personal" className={topTriggerClassName}>
              <User className="w-4 h-4" />
              Personal
            </TabsTrigger>
          </TabsList>

          {/* Sub-tabs — shown inline below top tabs, also sticky */}
          {activeTab === 'business' && canViewBusinessSettings && renderSubTabs(
            [{ value: 'profile', label: 'Business Profile' }, { value: 'einvoice', label: 'e-Invoice' }, { value: 'currency', label: 'Currency' }],
            businessSection, (v) => setBusinessSection(v as typeof businessSection)
          )}
          {activeTab === 'finance' && canViewBusinessSettings && renderSubTabs(
            [{ value: 'categories', label: 'Categories' }, { value: 'ai', label: 'AI & Automation' }],
            financeSection, (v) => setFinanceSection(v as typeof financeSection)
          )}
          {activeTab === 'people' && canViewBusinessSettings && renderSubTabs(
            [{ value: 'team', label: 'Team' }, { value: 'leave', label: 'Leave' }, { value: 'timesheet', label: 'Timesheet' }],
            peopleSection, (v) => setPeopleSection(v as typeof peopleSection)
          )}
          {activeTab === 'integrations' && canViewBusinessSettings && renderSubTabs(
            [{ value: 'stripe', label: 'Stripe' }, { value: 'einvoice', label: 'e-Invoice' }, { value: 'api-keys', label: 'API Keys' }],
            integrationsSection, (v) => setIntegrationsSection(v as typeof integrationsSection)
          )}
          {activeTab === 'personal' && renderSubTabs(
            [{ value: 'profile', label: 'Profile' }, { value: 'privacy', label: 'Privacy & Data' }],
            personalSection, (v) => setPersonalSection(v as typeof personalSection)
          )}
        </div>

        {/* ============================================================ */}
        {/* BUSINESS — Business Profile | e-Invoice | Currency           */}
        {/* ============================================================ */}
        {canViewBusinessSettings && (
          <TabsContent value="business" className="mt-0">
            <div className="bg-card rounded-lg border border-border p-6">
              <Suspense fallback={<TabLoader title="business settings" />}>
                <BusinessProfileSettings section={businessSection} />
              </Suspense>
            </div>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* FINANCE — Categories | AI & Automation                       */}
        {/* ============================================================ */}
        {canViewBusinessSettings && (
          <TabsContent value="finance" className="mt-0">
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
          <TabsContent value="people" className="mt-0">
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
          <TabsContent value="integrations" className="mt-0">
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
          <TabsContent value="billing" className="mt-0">
            <Suspense fallback={<TabLoader title="billing" />}>
              <BillingSettingsContent />
            </Suspense>
          </TabsContent>
        )}

        {/* ============================================================ */}
        {/* REFERRAL — All users                                         */}
        {/* ============================================================ */}
        <TabsContent value="referral" className="mt-0">
          <div className="bg-card rounded-lg border border-border p-6">
            <Suspense fallback={<TabLoader title="referral" />}>
              <ReferralDashboard />
            </Suspense>
          </div>
        </TabsContent>

        {/* ============================================================ */}
        {/* PERSONAL — Profile | Privacy & Data                          */}
        {/* ============================================================ */}
        <TabsContent value="personal" className="mt-0">
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
