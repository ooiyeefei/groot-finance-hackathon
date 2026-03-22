'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Download, Package } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import { useSellingPriceHistory } from '../hooks/use-selling-price-history'
import { PriceHistoryChart } from '@/domains/vendor-intelligence/components/price-history-chart'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { useAction } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

interface SalesHistoryTabProps {
  catalogItemId: Id<"catalog_items">
  currency: string
}

export default function SalesHistoryTab({ catalogItemId, currency }: SalesHistoryTabProps) {
  const { businessId } = useActiveBusiness()
  const {
    records,
    totalCount,
    isLoading,
    error,
    loadHistory,
    trendData,
    isTrendLoading,
    loadTrend,
  } = useSellingPriceHistory(businessId, catalogItemId)

  const [customerFilter, setCustomerFilter] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  const exportCSV = useAction(api.functions.sellingPriceHistory.exportSalesHistoryCSV)
  const [isExporting, setIsExporting] = useState(false)

  // Load data on mount
  useEffect(() => {
    loadHistory()
    loadTrend()
  }, [loadHistory, loadTrend])

  // Reload when filters change
  useEffect(() => {
    const filters: any = {}
    if (customerFilter) filters.customerId = customerFilter
    if (startDate) filters.startDate = startDate
    if (endDate) filters.endDate = endDate
    loadHistory(filters)
    loadTrend(filters)
  }, [customerFilter, startDate, endDate, loadHistory, loadTrend])

  const handleExport = async () => {
    if (!businessId) return
    setIsExporting(true)
    try {
      const result = await exportCSV({
        businessId: businessId as Id<"businesses">,
        catalogItemId: catalogItemId as Id<"catalog_items">,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      // Trigger browser download
      const blob = new Blob([result.csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setIsExporting(false)
    }
  }

  // Get unique customers for filter dropdown
  const uniqueCustomers = Array.from(
    new Map(
      records
        .filter((r: any) => r.customerId)
        .map((r: any) => [r.customerId, r.customerName])
    ).entries()
  )

  if (isLoading && records.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        <p>{error}</p>
      </div>
    )
  }

  if (records.length === 0 && !customerFilter && !startDate && !endDate) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">No sales recorded for this item yet</h3>
        <p className="text-muted-foreground">
          Sales prices are captured automatically when you issue sales invoices.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm text-muted-foreground block mb-1">Customer</label>
          <select
            className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="">All customers</option>
            {uniqueCustomers.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">From</label>
          <input
            type="date"
            className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">To</label>
          <input
            type="date"
            className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <Button
          onClick={handleExport}
          disabled={isExporting || records.length === 0}
          className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Export CSV
        </Button>
      </div>

      {/* Price Trend Chart */}
      {trendData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Price Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {isTrendLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PriceHistoryChart
                dataPoints={trendData.map((d: any) => ({
                  date: d.date,
                  unitPrice: d.unitPrice,
                  currency: d.currency,
                }))}
                currency={currency}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Sales History Table */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-foreground text-base">
            Sales History
            <Badge className="ml-2 bg-muted text-muted-foreground">{totalCount} records</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Date</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Customer</th>
                  <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Qty</th>
                  <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Unit Price</th>
                  <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Total</th>
                  <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Invoice #</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record: any) => (
                  <tr key={record._id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-4 py-3 text-foreground text-sm">
                      {formatBusinessDate(record.invoiceDate)}
                    </td>
                    <td className="px-4 py-3 text-foreground text-sm">{record.customerName}</td>
                    <td className="px-4 py-3 text-right text-foreground text-sm">{record.quantity}</td>
                    <td className="px-4 py-3 text-right text-foreground text-sm">
                      {record.isZeroPrice ? (
                        <span className="text-muted-foreground italic">$0 (promo)</span>
                      ) : (
                        formatCurrency(record.unitPrice, record.currency)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground text-sm">
                      {formatCurrency(record.totalAmount, record.currency)}
                    </td>
                    <td className="px-4 py-3 text-foreground text-sm">{record.invoiceNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
