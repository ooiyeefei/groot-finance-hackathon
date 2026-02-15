'use client'

import { useMemo } from 'react'
import { DollarSign, AlertTriangle, Users, CheckCircle } from 'lucide-react'
import { useAgingReport, useDebtorList } from '../hooks/use-debtor-management'
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency'
import { formatCurrency } from '@/lib/utils/format-number'

export default function ARDashboard() {
  const { currency: homeCurrency } = useHomeCurrency()
  const currency = homeCurrency ?? 'SGD'

  const { report, isLoading: agingLoading } = useAgingReport()
  const { summary, isLoading: debtorLoading } = useDebtorList()

  const isLoading = agingLoading || debtorLoading

  const summaryValues = useMemo(() => {
    if (!report?.summary) {
      return {
        totalReceivables: 0,
        overdue: 0,
        current: 0,
        totalDebtors: summary.totalDebtors,
      }
    }
    const s = report.summary
    return {
      totalReceivables: s.total,
      overdue: s.days1to30 + s.days31to60 + s.days61to90 + s.days90plus,
      current: s.current,
      totalDebtors: summary.totalDebtors,
    }
  }, [report, summary])

  const agingBuckets = useMemo(() => {
    if (!report?.summary) return []
    const s = report.summary
    return [
      { label: 'Current', value: s.current },
      { label: '1-30 Days', value: s.days1to30 },
      { label: '31-60 Days', value: s.days31to60 },
      { label: '61-90 Days', value: s.days61to90 },
      { label: '90+ Days', value: s.days90plus },
    ]
  }, [report])

  const cards = [
    {
      label: 'Total Receivables',
      value: formatCurrency(summaryValues.totalReceivables, currency),
      icon: DollarSign,
      accent: 'text-foreground',
      iconColor: 'text-muted-foreground',
    },
    {
      label: 'Overdue',
      value: formatCurrency(summaryValues.overdue, currency),
      icon: AlertTriangle,
      accent: 'text-destructive',
      iconColor: 'text-destructive',
    },
    {
      label: 'Current (Not Due)',
      value: formatCurrency(summaryValues.current, currency),
      icon: CheckCircle,
      accent: 'text-green-600 dark:text-green-400',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Active Debtors',
      value: String(summaryValues.totalDebtors),
      icon: Users,
      accent: 'text-foreground',
      iconColor: 'text-muted-foreground',
      isCount: true,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-card-gap">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-card border border-border rounded-lg p-4 min-h-[100px] transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
              <card.icon className={`w-4 h-4 ${card.iconColor}`} />
            </div>
            <div className="h-8 flex items-center">
              {isLoading ? (
                <div className="h-7 w-full bg-muted rounded animate-pulse" />
              ) : (
                <p className={`text-2xl font-bold ${card.accent}`}>
                  {card.value}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Aging Breakdown Table */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Debtor Aging Breakdown</h3>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : agingBuckets.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No outstanding receivables.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                    Aging Bucket
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    % of Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {agingBuckets.map((bucket) => (
                  <tr key={bucket.label} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-sm text-foreground">{bucket.label}</td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      {formatCurrency(bucket.value, currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground text-right">
                      {summaryValues.totalReceivables > 0
                        ? `${((bucket.value / summaryValues.totalReceivables) * 100).toFixed(1)}%`
                        : '0.0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted">
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">Total</td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                    {formatCurrency(summaryValues.totalReceivables, currency)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                    100.0%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Per-Debtor Aging (if data exists) */}
      {report?.debtors && report.debtors.length > 0 && (
        <div className="bg-card border border-border rounded-lg">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Top Debtors by Outstanding</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                    Debtor
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    Outstanding
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    Current
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    1-30
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    31-60
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    61-90
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    90+
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.debtors.slice(0, 10).map((debtor) => (
                  <tr
                    key={debtor.customerId}
                    className="border-b border-border last:border-b-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 text-sm text-foreground font-medium">
                      {debtor.customerName}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right font-semibold">
                      {formatCurrency(debtor.total, currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      {formatCurrency(debtor.current, currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      {formatCurrency(debtor.days1to30, currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      {formatCurrency(debtor.days31to60, currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      {formatCurrency(debtor.days61to90, currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">
                      {formatCurrency(debtor.days90plus, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
