import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import DocumentsContainer from '@/components/documents/documents-container'
import { ClientProviders } from '@/components/providers/client-providers'

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // Await params in Next.js 15
  const { locale } = await params

  // Debug logging for locale detection
  console.log('[Documents Page] Route locale parameter:', locale)

  // Get translations for server component with explicit locale
  const t = await getTranslations({locale, namespace: 'documents'})

  // Debug logging for translations
  console.log('[Documents Page] Title translation:', t('title'))
  console.log('[Documents Page] Subtitle translation:', t('subtitle'))

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
          <main className="flex-1 overflow-auto p-6">
            <DocumentsContainer />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}