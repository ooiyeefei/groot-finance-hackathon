import { redirect } from 'next/navigation'

export default async function SalesInvoicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect(`/${locale}/invoices#sales-invoices`)
}
