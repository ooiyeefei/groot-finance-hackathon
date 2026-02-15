import { redirect } from 'next/navigation'

export default async function PayablesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect(`/${locale}/invoices#ap-dashboard`)
}
