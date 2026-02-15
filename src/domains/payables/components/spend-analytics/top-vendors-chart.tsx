'use client'

import { formatCurrency } from '@/lib/utils/format-number'

interface TopVendor {
  vendorId: string | null
  vendorName: string
  totalSpend: number
  transactionCount: number
  percentOfTotal: number
}

interface TopVendorsChartProps {
  vendors: TopVendor[]
  totalSpend: number
  isLoading: boolean
  currency?: string
}

export default function TopVendorsChart({
  vendors,
  totalSpend,
  isLoading,
  currency = 'SGD',
}: TopVendorsChartProps) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="h-5 w-32 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const maxSpend = vendors.length > 0 ? vendors[0].totalSpend : 0

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Top Vendors by Spend</h3>
        <span className="text-xs text-muted-foreground">
          Total: {formatCurrency(totalSpend, currency)}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {vendors.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No spend data available</p>
        ) : (
          vendors.map((vendor, index) => (
            <div key={vendor.vendorId ?? `unassigned-${index}`} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground font-medium truncate mr-2">{vendor.vendorName}</span>
                <span className="text-foreground font-medium whitespace-nowrap">
                  {formatCurrency(vendor.totalSpend, currency)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${maxSpend > 0 ? (vendor.totalSpend / maxSpend) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">
                  {vendor.percentOfTotal.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {vendor.transactionCount} transaction{vendor.transactionCount !== 1 ? 's' : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
