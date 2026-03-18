'use client'

/**
 * Price Intelligence — AP Invoices sub-tab
 *
 * Enhanced with #320 Smart Vendor Intelligence features:
 * - Recharts line charts for price trends
 * - CSV export via papaparse
 * - DSPy AI-suggested cross-vendor item matches ("Suggest Matches" button)
 * - Cross-vendor item groups with confirm/reject
 * - Anomaly alerts inline per item
 */

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useAction, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import {
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Sparkles,
  Download,
  GitCompare,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PriceHistoryChart } from '@/domains/vendor-intelligence/components/price-history-chart'
import { CsvExportButton } from '@/domains/vendor-intelligence/components/csv-export-button'
import { CrossVendorComparisonTable } from '@/domains/vendor-intelligence/components/cross-vendor-comparison-table'
import { useCrossVendorGroups } from '@/domains/vendor-intelligence/hooks/use-cross-vendor-groups'

export default function PriceIntelligence() {
  const { businessId } = useActiveBusiness()
  const { currency: homeCurrency } = useHomeCurrency()
  const currency = homeCurrency ?? 'SGD'
  const bizId = businessId as Id<'businesses'>

  // Get all vendors
  const vendorResult = useQuery(
    api.functions.vendors.list,
    businessId ? { businessId: bizId } : 'skip'
  )

  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [isSuggesting, setIsSuggesting] = useState(false)

  // Get items for selected vendor
  const vendorItems = useQuery(
    api.functions.vendorPriceHistory.getVendorItems,
    selectedVendorId
      ? { vendorId: selectedVendorId as Id<'vendors'> }
      : 'skip'
  )

  // Get cross-vendor comparison for expanded item
  const crossVendorData = useQuery(
    api.functions.vendorPriceHistory.getCrossVendorComparison,
    expandedItem && businessId
      ? {
          businessId: bizId,
          normalizedDescription: expandedItem,
        }
      : 'skip'
  )

  // Get price trend for expanded item
  const trendData = useQuery(
    api.functions.vendorPriceHistory.getPriceTrendData,
    expandedItem && selectedVendorId && businessId
      ? {
          businessId: bizId,
          vendorId: selectedVendorId as Id<'vendors'>,
          itemIdentifier: expandedItem,
        }
      : 'skip'
  )

  // Get vendor price history for CSV export
  const vendorPriceHistory = useQuery(
    api.functions.vendorPriceHistory.getVendorPriceHistory,
    selectedVendorId
      ? { vendorId: selectedVendorId as Id<'vendors'>, limit: 200 }
      : 'skip'
  )

  // DSPy cross-vendor matching
  const suggestMatches = useAction(api.functions.vendorItemMatching.suggestMatches)
  const { groups, isLoading: groupsLoading } = useCrossVendorGroups(
    businessId ? bizId : undefined
  )

  const activeVendors = useMemo(
    () => (vendorResult?.vendors ?? []).filter((v) => v.status === 'active'),
    [vendorResult]
  )

  const isLoading = vendorResult === undefined

  const handleSuggestMatches = useCallback(async () => {
    if (!businessId) return
    setIsSuggesting(true)
    try {
      const result = await suggestMatches({ businessId: bizId })
      if (result.suggestions.length === 0) {
        // No matches found — that's ok
      }
    } catch (e) {
      console.error('[PriceIntelligence] Suggest matches failed:', e)
    } finally {
      setIsSuggesting(false)
    }
  }, [businessId, bizId, suggestMatches])

  // Empty state
  if (!isLoading && activeVendors.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-foreground mb-1">No Vendors Yet</h3>
        <p className="text-muted-foreground text-sm">
          Price data is automatically captured when invoices are processed.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {/* Vendor Selector */}
          {isLoading ? (
            <div className="h-9 w-64 bg-muted rounded animate-pulse" />
          ) : (
            <select
              value={selectedVendorId ?? ''}
              onChange={(e) => {
                setSelectedVendorId(e.target.value || null)
                setExpandedItem(null)
              }}
              className="max-w-xs bg-input border border-border text-foreground rounded-md px-3 py-1.5 text-sm focus:ring-ring focus:border-ring"
            >
              <option value="">Choose a vendor...</option>
              {activeVendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* DSPy Suggest Matches */}
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
            onClick={handleSuggestMatches}
            disabled={isSuggesting || !businessId}
          >
            {isSuggesting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Sparkles className="w-4 h-4 mr-1.5" />
            )}
            Suggest Matches
          </Button>

          {/* CSV Export */}
          {selectedVendorId && vendorPriceHistory && (
            <CsvExportButton
              data={vendorPriceHistory.map((r) => ({
                itemDescription: r.itemDescription,
                itemCode: r.itemCode,
                observedAt: r.observedAt,
                unitPrice: r.unitPrice,
                quantity: r.quantity,
                currency: r.currency,
              })) as any}
              vendorName={activeVendors.find((v) => v._id === selectedVendorId)?.name}
            />
          )}
        </div>
      </div>

      {/* Cross-Vendor Item Groups (from DSPy) */}
      {groups.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Cross-Vendor Groups ({groups.length})
            </span>
          </div>
          {groups.slice(0, 5).map((group) => (
            <div
              key={group._id}
              className="bg-card border border-border rounded-lg p-3 flex items-center justify-between"
            >
              <div>
                <span className="text-sm font-medium text-foreground">
                  {group.groupName}
                </span>
                <span className="text-xs text-muted-foreground ml-2">
                  {group.itemReferences.length} vendors
                </span>
              </div>
              <Badge
                variant={
                  group.matchSource === 'ai-suggested'
                    ? 'info'
                    : group.matchSource === 'user-confirmed'
                      ? 'success'
                      : 'default'
                }
                className="text-xs"
              >
                {group.matchSource === 'ai-suggested'
                  ? 'AI Suggested'
                  : group.matchSource === 'user-confirmed'
                    ? 'Confirmed'
                    : 'Manual'}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* No vendor selected */}
      {!selectedVendorId && !isLoading && (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Price Intelligence</h3>
          <p className="text-muted-foreground text-sm">
            Select a vendor above to view tracked items, price trends, and cross-vendor comparisons.
            Click "Suggest Matches" to let AI find similar items across vendors.
          </p>
        </div>
      )}

      {/* Items List */}
      {selectedVendorId && (
        <div className="bg-card border border-border rounded-lg">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Tracked Items</h3>
          </div>

          {vendorItems === undefined ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : vendorItems.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No price data for this vendor yet.</p>
              <p className="text-xs mt-1">
                Prices are recorded when invoices from this vendor are processed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {vendorItems.map((item) => {
                const normalizedDesc = item.itemDescription.trim().toLowerCase()
                const isExpanded = expandedItem === normalizedDesc
                return (
                  <div key={item.itemDescription}>
                    {/* Item Row */}
                    <button
                      onClick={() =>
                        setExpandedItem(isExpanded ? null : normalizedDesc)
                      }
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      <span className="text-muted-foreground">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.itemDescription}
                        </p>
                        {item.itemCode && (
                          <p className="text-xs text-muted-foreground">
                            Code: {item.itemCode}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">
                          {formatCurrency(item.latestPrice, item.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.priceCount} observation
                          {item.priceCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </button>

                    {/* Expanded: Price Chart + Cross-Vendor Comparison */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pl-11 space-y-4">
                        {/* Price Trend Chart (Recharts) */}
                        {trendData && trendData.length > 1 && (
                          <div className="bg-muted rounded-lg p-3">
                            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                              Price Trend
                            </h4>
                            <PriceHistoryChart
                              dataPoints={trendData}
                              currency={item.currency}
                            />
                          </div>
                        )}

                        {/* Cross-Vendor Comparison */}
                        <div className="bg-muted rounded-lg p-3">
                          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                            Cross-Vendor Comparison
                          </h4>
                          {crossVendorData === undefined ? (
                            <div className="flex items-center gap-2 py-2">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                Loading comparison...
                              </span>
                            </div>
                          ) : crossVendorData.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-1">
                              No other vendors supply this item.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {crossVendorData.map((vendor) => (
                                <div
                                  key={String(vendor.vendorId)}
                                  className={`flex items-center justify-between py-1.5 px-2 rounded ${
                                    vendor.isCheapest
                                      ? 'bg-green-500/10 border border-green-500/30'
                                      : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-foreground">
                                      {vendor.vendorName}
                                    </span>
                                    {vendor.isCheapest && (
                                      <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 text-xs">
                                        Cheapest
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <span className="text-sm font-semibold text-foreground">
                                      {formatCurrency(
                                        vendor.latestPrice,
                                        vendor.currency
                                      )}
                                    </span>
                                    <span className="text-xs text-muted-foreground ml-2">
                                      {formatBusinessDate(vendor.lastObservedAt)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
