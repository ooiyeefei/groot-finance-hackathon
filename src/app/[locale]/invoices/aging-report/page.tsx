'use client'

import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AgingReport from '@/domains/sales-invoices/components/aging-report'

export default function AgingReportPage() {
  const router = useRouter()
  const params = useParams()
  const locale = params?.locale as string ?? 'en'

  return (
    <div className="space-y-4 p-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/${locale}/invoices#debtors`)}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Debtors
      </Button>
      <AgingReport />
    </div>
  )
}
