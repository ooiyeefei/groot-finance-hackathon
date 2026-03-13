'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useDashboardMetrics } from '@/domains/accounting/hooks/use-dashboard-metrics'
import { formatCurrency } from '@/lib/utils/format-number'

export default function AccountingDashboard() {
  const { metrics, isLoading } = useDashboardMetrics()

  if (isLoading) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Accounting Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Revenue (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics?.revenue || 0, 'MYR')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Expenses (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics?.expenses || 0, 'MYR')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics?.netProfit || 0, 'MYR')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Cash Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics?.cashBalance || 0, 'MYR')}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
