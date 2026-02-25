import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import { ClientProviders } from '@/components/providers/client-providers'
import { getUserRole } from '@/domains/users/lib/user.service'

export default async function SalesInvoiceDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const roleData = await getUserRole()
  const isAdmin = roleData?.permissions?.finance_admin

  if (!isAdmin) {
    redirect(`/${locale}/expense-claims`)
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </div>
      </div>
    </ClientProviders>
  )
}
