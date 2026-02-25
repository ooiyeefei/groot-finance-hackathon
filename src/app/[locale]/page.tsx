import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import CompleteDashboard from '@/domains/analytics/components/complete-dashboard'
import { GeneralDisclaimer } from '@/components/ui/financial-disclaimer'
import { ClientProviders } from '@/components/providers/client-providers'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { UpgradeBanner } from '@/domains/billing/components/upgrade-banner'
import { RenewalBanner } from '@/domains/billing/components/renewal-banner'
import { getUserRole } from '@/domains/users/lib/user.service'

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  // Server-side authentication check
  let userId: string | null = null

  try {
    const authResult = await auth()
    userId = authResult.userId
  } catch (error) {
    console.error('[Dashboard] Auth error:', error)
    redirect('/sign-in')
  }

  if (!userId) {
    redirect('/sign-in')
  }

  // CRITICAL FIX: Check business context before rendering dashboard
  const { locale } = await params

  let userProfile = null
  let roleData = null

  try {
    // Use ensureUserProfile from Convex instead of getUserData from Supabase
    userProfile = await ensureUserProfile(userId)
  } catch (error) {
    console.error('[Dashboard] Error ensuring user profile:', error)
    // If user doesn't exist in Convex, show access denied
    redirect(`/${locale}/access-denied`)
  }

  // If user doesn't have a profile or no business_id, redirect to expense-claims (safe default).
  // The middleware already handles the genuine "no business" → onboarding redirect using an
  // unauthenticated Convex query. If a request reaches here, it passed the middleware check,
  // meaning the user HAS a business. A null profile is most likely a transient auth token issue
  // (e.g., Clerk JWT not fully propagated on first login after sign-in).
  if (!userProfile || !userProfile.business_id) {
    console.log(`[Dashboard] User profile unavailable (likely transient auth issue) - redirecting to expense-claims instead of onboarding`)
    redirect(`/${locale}/expense-claims`)
  }

  console.log(`[Dashboard] User has business context: ${userProfile.business_id}`)

  try {
    // Admin role check - redirect non-admins to expense claims (dashboard is for finance admins only)
    roleData = await getUserRole()
  } catch (error) {
    console.error('[Dashboard] Error getting user role:', error)
    // Default to non-admin on error - redirect to expense claims
    redirect(`/${locale}/expense-claims`)
  }

  const isAdmin = roleData?.permissions?.finance_admin

  if (!isAdmin) {
    console.log(`[Dashboard] Non-finance_admin user redirected to expense-claims (finance_admin: ${isAdmin})`)
    redirect(`/${locale}/expense-claims`)
  }

  const user = await currentUser()

  // Get translations for server component with explicit locale
  const t = await getTranslations({locale, namespace: 'dashboard'})

  const welcomeText = user?.firstName
    ? `${t('welcomePersonalized', { firstName: user.firstName })} - ${t('intelligentCopilot')}`
    : `${t('welcome')} - ${t('intelligentCopilot')}`

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar - hidden on mobile, visible on sm+ */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <HeaderWithUser
            title={t('title')}
            subtitle={t('subtitle')}
          />

          {/* Main Content Area - extra bottom padding on mobile for bottom nav */}
          <main className="flex-1 overflow-auto px-4 sm:px-6 pt-2 sm:pt-3 pb-24 sm:pb-6">
            <div className="max-w-7xl mx-auto">
              {/* Subscription Banners */}
              <div className="space-y-3 mb-3 empty:hidden">
                {/* Upgrade Banner for Free/Trial Plan Users */}
                <UpgradeBanner />
                {/* Renewal Banner for Paid Plan Users */}
                <RenewalBanner />
              </div>

              {/* Complete Financial Dashboard with Charts */}
              <CompleteDashboard />
            </div>
          </main>

          {/* Footer Disclaimer - hidden on mobile to save space */}
          <footer className="hidden sm:block border-t border-border p-4">
            <div className="max-w-7xl mx-auto">
              <GeneralDisclaimer />
            </div>
          </footer>
        </div>
      </div>
    </ClientProviders>
  )
}
