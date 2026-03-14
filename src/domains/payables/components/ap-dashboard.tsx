'use client'

import { useState, useMemo } from 'react'
import { useActiveBusiness } from '@/contexts/business-context'
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency'
import SummaryCards from './summary-cards'
import VendorAgingTable from './vendor-aging-table'
import VendorAgingDrilldown from './vendor-aging-drilldown'
import UpcomingPaymentsTable from './upcoming-payments-table'
import PaymentRecorderDialog from './payment-recorder-dialog'
import TopVendorsChart from './spend-analytics/top-vendors-chart'
import CategoryBreakdown from './spend-analytics/category-breakdown'
import SpendTrend from './spend-analytics/spend-trend'
import { useVendorAging } from '../hooks/use-vendor-aging'
import { useUpcomingPayments } from '../hooks/use-upcoming-payments'
import { useSpendAnalytics } from '../hooks/use-spend-analytics'
import MatchingSummary from './matching-summary'

export default function APDashboard() {
  const { businessId } = useActiveBusiness()
  const { currency: homeCurrency } = useHomeCurrency()
  const currency = homeCurrency ?? 'SGD'

  // Hooks
  const aging = useVendorAging()
  const upcoming = useUpcomingPayments()
  const spend = useSpendAnalytics()

  // State for dialogs
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null)

  // Compute summary card values from aging and upcoming data
  const summaryValues = useMemo(() => {
    const totalOutstanding = aging.totals.totalOutstanding

    // Overdue = sum of all non-current buckets
    const amountOverdue = aging.totals.days1to30 + aging.totals.days31to60 + aging.totals.days61to90 + aging.totals.days90plus

    // Due this week = sum of upcoming payments where daysRemaining <= 7
    const dueThisWeek = upcoming.payments
      .filter((p) => p.daysRemaining >= 0 && p.daysRemaining <= 7)
      .reduce((sum, p) => sum + p.outstandingBalance, 0)

    // Due this month = sum of upcoming payments where daysRemaining <= 30
    const dueThisMonth = upcoming.payments
      .filter((p) => p.daysRemaining >= 0 && p.daysRemaining <= 30)
      .reduce((sum, p) => sum + p.outstandingBalance, 0)

    return { totalOutstanding, amountOverdue, dueThisWeek, dueThisMonth }
  }, [aging.totals, upcoming.payments])

  // Drilldown vendor name
  const selectedVendorName = useMemo(() => {
    if (aging.selectedVendorId === null) return ''
    if (aging.selectedVendorId === '__unassigned__') return 'Unassigned Vendor'
    const vendor = aging.vendors.find((v) => v.vendorId === aging.selectedVendorId)
    return vendor?.vendorName ?? 'Vendor'
  }, [aging.selectedVendorId, aging.vendors])

  const handleRecordPayment = (invoiceId: string) => {
    setPaymentInvoiceId(invoiceId)
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <SummaryCards
        totalOutstanding={summaryValues.totalOutstanding}
        amountOverdue={summaryValues.amountOverdue}
        dueThisWeek={summaryValues.dueThisWeek}
        dueThisMonth={summaryValues.dueThisMonth}
        isLoading={aging.isLoading}
        currency={currency}
      />

      {/* 3-Way Matching Summary */}
      <MatchingSummary />

      {/* Vendor Aging Table - Full width */}
      <VendorAgingTable
        vendors={aging.vendors}
        totals={aging.totals}
        isLoading={aging.isLoading}
        onSelectVendor={aging.setSelectedVendorId}
        currency={currency}
      />

      {/* Two-column grid: Upcoming Payments + Top Vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-card-gap">
        <UpcomingPaymentsTable
          payments={upcoming.payments}
          periodDays={upcoming.periodDays}
          onPeriodChange={upcoming.setPeriodDays}
          isLoading={upcoming.isLoading}
          onRecordPayment={handleRecordPayment}
          currency={currency}
        />
        <TopVendorsChart
          vendors={spend.topVendors}
          totalSpend={spend.totalSpend}
          isLoading={spend.isLoading}
          currency={currency}
        />
      </div>

      {/* Spend Trend - Full width */}
      <SpendTrend
        data={spend.monthlyTrend}
        isLoading={spend.isLoading}
        currency={currency}
      />

      {/* Category Breakdown */}
      <CategoryBreakdown
        categories={spend.categoryBreakdown}
        isLoading={spend.isLoading}
        currency={currency}
      />

      {/* Drilldown Modal */}
      {aging.selectedVendorId !== null && (
        <VendorAgingDrilldown
          vendorName={selectedVendorName}
          entries={aging.drilldownEntries}
          isLoading={aging.isDrilldownLoading}
          onClose={() => aging.setSelectedVendorId(null)}
          onRecordPayment={handleRecordPayment}
          currency={currency}
        />
      )}

      {/* Payment Recorder Dialog */}
      <PaymentRecorderDialog
        invoiceId={paymentInvoiceId}
        isOpen={paymentInvoiceId !== null}
        onClose={() => setPaymentInvoiceId(null)}
      />
    </div>
  )
}
