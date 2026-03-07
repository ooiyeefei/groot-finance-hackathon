// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import DebtorDetail from '@/domains/sales-invoices/components/debtor-detail'

interface DebtorDetailPageProps {
  params: Promise<{
    locale: string
    customerId: string
  }>
}

export default async function DebtorDetailPage({ params }: DebtorDetailPageProps) {
  const { customerId } = await params
  return <DebtorDetail customerId={customerId} />
}
