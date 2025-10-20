import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import CompleteDashboard from '@/domains/analytics/components/complete-dashboard'
import { GeneralDisclaimer } from '@/components/ui/financial-disclaimer'
import { ClientProviders } from '@/components/providers/client-providers'
import { getUserData } from '@/lib/db/supabase-server'

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
  try {
    const userData = await getUserData(userId)

    // If user has no business_id, redirect to onboarding immediately
    if (!userData.business_id) {
      console.log(`[Dashboard] User ${userData.email} has no business context, redirecting to onboarding`)
      const { locale } = await params
      redirect(`/${locale}/onboarding/business`)
    }

    console.log(`[Dashboard] User ${userData.email} has business context: ${userData.business_id}`)
  } catch (error) {
    console.error('[Dashboard] Error checking business context:', error)
    // If user doesn't exist in our system, redirect to onboarding
    const { locale } = await params
    redirect(`/${locale}/onboarding/business`)
  }

  const user = await currentUser()

  // Await params in Next.js 15
  const { locale } = await params

  // Get translations for server component with explicit locale
  const t = await getTranslations({locale, namespace: 'dashboard'})

  const welcomeText = user?.firstName
    ? `${t('welcomePersonalized', { firstName: user.firstName })} - ${t('intelligentCopilot')}`
    : `${t('welcome')} - ${t('intelligentCopilot')}`

  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title={t('title')}
            subtitle={t('subtitle')}
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
              {/* Complete Financial Dashboard with Charts */}
              <CompleteDashboard />
            </div>
          </main>

          {/* Footer Disclaimer */}
          <footer className="border-t border-gray-700 p-4">
            <div className="max-w-7xl mx-auto">
              <GeneralDisclaimer />
            </div>
          </footer>
        </div>
      </div>
    </ClientProviders>
  )
}
