import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ClientProviders } from '@/components/providers/client-providers'
import { getUserRole } from '@/domains/users/lib/user.service'
import { InvoiceEditorLayout } from '@/domains/sales-invoices/components/invoice-editor-layout'

export default async function CreateSalesInvoicePage({ params }: { params: Promise<{ locale: string }> }) {
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
      <InvoiceEditorLayout mode="create" />
    </ClientProviders>
  )
}
