// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

export default async function SalesInvoicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect(`/${locale}/invoices?tab=ar&sub=sales`)
}
