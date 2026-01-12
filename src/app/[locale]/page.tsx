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

  try {
    // Use ensureUserProfile from Convex instead of getUserData from Supabase
    const userProfile = await ensureUserProfile(userId)

    // If user doesn't have a profile or no business_id, redirect to onboarding
    if (!userProfile || !userProfile.business_id) {
      console.log(`[Dashboard] User has no business context, redirecting to onboarding`)
      redirect(`/${locale}/onboarding/business`)
    }

    console.log(`[Dashboard] User has business context: ${userProfile.business_id}`)
  } catch (error) {
    console.error('[Dashboard] Error checking business context:', error)
    // If user doesn't exist in Convex, show access denied
    redirect(`/${locale}/access-denied`)
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
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title={t('title')}
            subtitle={t('subtitle')}
          />

          {/* Main Content Area - extra bottom padding on mobile for bottom nav */}
          <main className="flex-1 overflow-auto p-4 sm:p-6 pb-24 sm:pb-6">
            <div className="max-w-7xl mx-auto">
              {/* Upgrade Banner for Free Plan Users */}
              <UpgradeBanner />

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
