import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ApplicationCreateForm from '@/domains/applications/components/application-create-form'
import { ClientProviders } from '@/components/providers/client-providers'


export default async function NewApplicationPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <ClientProviders>
      
        <div className="flex h-screen bg-background">
          <Sidebar />

          <div className="flex-1 flex flex-col">
            <HeaderWithUser
              title="Create Application"
              subtitle="Start a new personal loan application"
            />

            <main className="flex-1 overflow-auto p-6">
              <ApplicationCreateForm />
            </main>
          </div>
        </div>
      
    </ClientProviders>
  )
}