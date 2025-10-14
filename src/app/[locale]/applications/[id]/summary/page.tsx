import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ApplicationSummaryContainer from '@/domains/applications/components/application-summary-container'
import { ClientProviders } from '@/components/providers/client-providers'

interface ApplicationSummaryPageProps {
  params: Promise<{
    locale: string
    id: string
  }>
}

export default async function ApplicationSummaryPage({ params }: ApplicationSummaryPageProps) {
  const { userId } = await auth()
  const { locale, id } = await params

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        <Sidebar />

        <div className="flex-1 flex flex-col">
          <HeaderWithUser
            title="Application Summary"
            subtitle="AI-Powered Document Processing Summary"
          />

          <main className="flex-1 overflow-auto p-6">
            {/* Back Button */}
            <div className="mb-6">
              <Link href={`/${locale}/applications/${id}`}>
                <Button variant="outline" size="sm" className="bg-gray-700 text-white border-gray-600 hover:bg-gray-600 hover:border-gray-500">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Details
                </Button>
              </Link>
            </div>

            <ApplicationSummaryContainer applicationId={id} />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}