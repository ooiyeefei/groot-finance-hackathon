'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Package } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import { useCatalogVendorMappings } from '../hooks/use-catalog-vendor-mappings'
import { usePurchaseHistory } from '../hooks/use-purchase-history'
import { PriceHistoryChart } from '@/domains/vendor-intelligence/components/price-history-chart'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import MappingBanner from './mapping-banner'
import type { Id } from '../../../../convex/_generated/dataModel'

interface PurchaseHistoryTabProps {
  catalogItemId: Id<"catalog_items">
  currency: string
}

export default function PurchaseHistoryTab({ catalogItemId, currency }: PurchaseHistoryTabProps) {
  const { businessId } = useActiveBusiness()
  const { mappings, unmappedCount, isLoading: isMappingsLoading } = useCatalogVendorMappings(businessId, catalogItemId)
  const {
    records,
    totalCount,
    vendors,
    isLoading: isHistoryLoading,
    trendData,
    isTrendLoading,
    loadHistory,
    loadTrend,
  } = usePurchaseHistory(businessId, catalogItemId)

  const [vendorFilter, setVendorFilter] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  const confirmedMappings = mappings.filter(
    (m: any) => m.matchSource === 'user-confirmed' || m.matchSource === 'user-created'
  )

  // Load purchase data when mappings are available
  useEffect(() => {
    if (confirmedMappings.length > 0) {
      loadHistory()
      loadTrend()
    }
  }, [confirmedMappings.length, loadHistory, loadTrend])

  // Reload when filters change
  useEffect(() => {
    if (confirmedMappings.length === 0) return
    const filters: any = {}
    if (vendorFilter) filters.vendorId = vendorFilter
    if (startDate) filters.startDate = startDate
    if (endDate) filters.endDate = endDate
    loadHistory(filters)
    loadTrend(filters)
  }, [vendorFilter, startDate, endDate, confirmedMappings.length, loadHistory, loadTrend])

  if (isMappingsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Mapping banner — always show if no confirmed mappings but vendor data exists */}
      {confirmedMappings.length === 0 && (
        <MappingBanner catalogItemId={catalogItemId} />
      )}

      {/* Linked vendor items badges */}
      {confirmedMappings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {confirmedMappings.map((m: any) => (
            <Badge key={m._id} className="bg-muted text-muted-foreground">
              {m.vendorName}: {m.vendorItemDescription}
            </Badge>
          ))}
        </div>
      )}

      {/* Filters — only show when we have data */}
      {confirmedMappings.length > 0 && (
        <div className="flex flex-wrap gap-3 items-end">
          {vendors.length > 1 && (
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Vendor</label>
              <select
                className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
              >
                <option value="">All vendors</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}
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
        </div>
      )}

      {/* Purchase Price Trend Chart */}
      {confirmedMappings.length > 0 && trendData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Purchase Cost Trend</CardTitle>
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

      {/* Purchase History Table */}
      {confirmedMappings.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground text-base">
              Purchase History
              <Badge className="ml-2 bg-muted text-muted-foreground">{totalCount} records</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isHistoryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : records.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                No purchase records found for the selected filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Date</th>
                      <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Vendor</th>
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
                        <td className="px-4 py-3 text-foreground text-sm">{record.vendorName}</td>
                        <td className="px-4 py-3 text-right text-foreground text-sm">{record.quantity}</td>
                        <td className="px-4 py-3 text-right text-foreground text-sm">
                          {formatCurrency(record.unitPrice, record.currency)}
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
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state — no vendor data at all */}
      {confirmedMappings.length === 0 && !unmappedCount.hasData && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No purchase data available</h3>
          <p className="text-muted-foreground">
            Purchase prices will appear here once AP invoices with matching items are processed through Vendor Intelligence.
          </p>
        </div>
      )}
    </div>
  )
}
