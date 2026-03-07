// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import DebtorStatement from '@/domains/sales-invoices/components/debtor-statement'

interface StatementPageProps {
  params: Promise<{
    locale: string
    customerId: string
  }>
}

export default async function StatementPage({ params }: StatementPageProps) {
  const { customerId } = await params
  return <DebtorStatement customerId={customerId} />
}
