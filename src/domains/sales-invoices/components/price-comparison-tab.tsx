'use client'

import { useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import { useMarginSummary } from '../hooks/use-margin-summary'
import { useSellingPriceHistory } from '../hooks/use-selling-price-history'
import { usePurchaseHistory } from '../hooks/use-purchase-history'
import PriceComparisonChart from './price-comparison-chart'
import { formatCurrency } from '@/lib/utils/format-number'
import type { Id } from '../../../../convex/_generated/dataModel'

interface PriceComparisonTabProps {
  catalogItemId: Id<"catalog_items">
  currency: string
}

export default function PriceComparisonTab({ catalogItemId, currency }: PriceComparisonTabProps) {
  const { businessId } = useActiveBusiness()
  const { data: margin, isLoading: isMarginLoading, loadMargin } = useMarginSummary(businessId, catalogItemId)
  const { trendData: sellingTrend, isTrendLoading: isSellingTrendLoading, loadTrend: loadSellingTrend } = useSellingPriceHistory(businessId, catalogItemId)
  const { trendData: purchaseTrend, isTrendLoading: isPurchaseTrendLoading, loadTrend: loadPurchaseTrend } = usePurchaseHistory(businessId, catalogItemId)

  useEffect(() => {
    loadMargin()
    loadSellingTrend()
    loadPurchaseTrend()
  }, [loadMargin, loadSellingTrend, loadPurchaseTrend])

  if (isMarginLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!margin) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Unable to load margin data.
      </div>
    )
  }

  const hasSellingData = margin.latestSellingPrice !== null
  const hasPurchaseData = margin.latestPurchaseCost !== null
  const isTrendLoading = isSellingTrendLoading || isPurchaseTrendLoading

  return (
    <div className="space-y-6">
      {/* Margin Indicator Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Latest Cost */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Latest Purchase Cost</p>
            {hasPurchaseData ? (
              <>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(margin.latestPurchaseCost!.unitPrice, margin.latestPurchaseCost!.currency)}
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  from {margin.latestPurchaseCost!.vendorName}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {margin.hasMappings ? 'No purchase data yet' : 'No vendor mappings'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Latest Selling Price */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Latest Selling Price</p>
            {hasSellingData ? (
              <>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(margin.latestSellingPrice!.unitPrice, margin.latestSellingPrice!.currency)}
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  to {margin.latestSellingPrice!.customerName}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No sales recorded</p>
            )}
          </CardContent>
        </Card>

        {/* Gross Margin */}
        <Card className={`border ${
          margin.marginPercent !== null && margin.marginPercent < 10
            ? 'border-destructive/30 bg-destructive/5'
            : margin.marginPercent !== null && margin.marginPercent >= 30
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-border bg-card'
        }`}>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Gross Margin</p>
            {margin.marginPercent !== null ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-foreground">
                    {margin.marginPercent}%
                  </p>
                  {margin.marginPercent >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  )}
                </div>
                {margin.marginWarning && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    <p className="text-yellow-600 text-xs">{margin.marginWarning}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {!hasSellingData && !hasPurchaseData
                  ? 'Need both purchase and selling data'
                  : !hasSellingData
                    ? 'No sales recorded'
                    : 'No purchase cost available'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Missing data guidance */}
      {!hasPurchaseData && hasSellingData && !margin.hasMappings && (
        <Card className="bg-yellow-500/5 border-yellow-500/20">
          <CardContent className="p-4">
            <p className="text-foreground text-sm font-medium">
              No vendor mappings configured
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Go to the Purchase History tab to link vendor items to this catalog item for margin analysis.
            </p>
          </CardContent>
        </Card>
      )}

      {!hasSellingData && hasPurchaseData && (
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <p className="text-foreground text-sm font-medium">
              No sales recorded
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Add this item to a sales invoice to track selling prices and calculate margins.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Price Comparison Chart — dual line with real data */}
      {(sellingTrend.length > 0 || purchaseTrend.length > 0) && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">Price Comparison Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {isTrendLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PriceComparisonChart
                sellingData={sellingTrend.map((d: any) => ({ date: d.date, unitPrice: d.unitPrice }))}
                purchaseData={purchaseTrend.map((d: any) => ({ date: d.date, unitPrice: d.unitPrice }))}
                currency={currency}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
