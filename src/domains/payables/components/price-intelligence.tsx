'use client'

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
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
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default function PriceIntelligence() {
  const { businessId } = useActiveBusiness()
  const { currency: homeCurrency } = useHomeCurrency()
  const currency = homeCurrency ?? 'SGD'

  // Get all vendors to build vendor selector
  const vendorResult = useQuery(
    api.functions.vendors.list,
    businessId ? { businessId: businessId as Id<'businesses'> } : 'skip'
  )

  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

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
          businessId: businessId as Id<'businesses'>,
          normalizedDescription: expandedItem,
        }
      : 'skip'
  )

  const activeVendors = useMemo(
    () => (vendorResult?.vendors ?? []).filter((v) => v.status === 'active'),
    [vendorResult]
  )

  const isLoading = vendorResult === undefined

  // Empty state: no vendors at all
  if (!isLoading && activeVendors.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-foreground mb-1">No Vendors Yet</h3>
        <p className="text-muted-foreground text-sm">
          Price data is automatically captured when invoices are processed. Add vendors and upload invoices to start tracking prices.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Vendor Selector */}
      <div className="bg-card border border-border rounded-lg p-4">
        <label className="block text-sm font-medium text-foreground mb-2">
          Select Vendor
        </label>
        {isLoading ? (
          <div className="h-10 bg-muted rounded animate-pulse" />
        ) : (
          <select
            value={selectedVendorId ?? ''}
            onChange={(e) => {
              setSelectedVendorId(e.target.value || null)
              setExpandedItem(null)
            }}
            className="w-full max-w-md bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm focus:ring-ring focus:border-ring"
          >
            <option value="">Choose a vendor to view price data...</option>
            {activeVendors.map((v) => (
              <option key={v._id} value={v._id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* No vendor selected */}
      {!selectedVendorId && !isLoading && (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Price Intelligence</h3>
          <p className="text-muted-foreground text-sm">
            Select a vendor above to view tracked items, price history, and cross-vendor comparisons.
            Price data is automatically captured from incoming invoices.
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
                const isExpanded =
                  expandedItem === item.itemDescription.trim().toLowerCase()
                return (
                  <div key={item.itemDescription}>
                    {/* Item Row */}
                    <button
                      onClick={() =>
                        setExpandedItem(
                          isExpanded
                            ? null
                            : item.itemDescription.trim().toLowerCase()
                        )
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
                          {item.priceCount} observation{item.priceCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </button>

                    {/* Cross-Vendor Comparison (expanded) */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pl-11">
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
