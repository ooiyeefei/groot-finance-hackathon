import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import CompleteDashboard from '@/domains/analytics/components/complete-dashboard'
import { GeneralDisclaimer } from '@/components/ui/financial-disclaimer'
import { ClientProviders } from '@/components/providers/client-providers'

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
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
